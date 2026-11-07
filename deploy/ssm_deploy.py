"""GitHub-hosted runner only: upload a checksummed bundle and deploy through SSM."""
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import tempfile
import time


def configuration(env):
    patterns = {
        'AWS_REGION': r'[a-z]{2}(?:-[a-z]+)+-\d',
        'DEPLOY_BUCKET': r'[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]',
        'EC2_INSTANCE_ID': r'i-[a-f0-9]{8,17}',
        'AWS_DEPLOY_ROLE_ARN': r'arn:aws:iam::\d{12}:role/[A-Za-z0-9_+=,.@/-]+',
    }
    values = {}
    for key, pattern in patterns.items():
        value = env.get(key, '')
        if not re.fullmatch(pattern, value):
            raise ValueError(f'Missing or invalid GitHub variable: {key}')
        values[key] = value
    return values


def release_id(env):
    value = f"{env.get('GITHUB_SHA', '')}-{env.get('GITHUB_RUN_ID', '')}-{env.get('GITHUB_RUN_ATTEMPT', '')}"
    if not re.fullmatch(r'[a-f0-9]{40}-\d+-\d+', value):
        raise ValueError('Invalid GitHub release identifiers')
    return value


def checksum(path):
    with path.open('rb') as stream:
        actual = hashlib.file_digest(stream, 'sha256').hexdigest()
    expected = Path(str(path) + '.sha256').read_text().split()[0]
    if actual != expected:
        raise ValueError('Release checksum mismatch; no deployment was attempted')
    return actual


def commands(config, release, digest):
    uri = f"s3://{config['DEPLOY_BUCKET']}/backend/{release}/backend-release.tar.gz"
    return [
        'set -eu',
        'work=$(mktemp -d /tmp/fieldwork-release.XXXXXX)',
        'trap \'rm -rf "$work"\' EXIT',
        f'aws s3 cp {shlex.quote(uri)} "$work/bundle.tar.gz" --region {shlex.quote(config["AWS_REGION"])} --only-show-errors',
        f'printf "%s  %s\\n" {shlex.quote(digest)} "$work/bundle.tar.gz" | sha256sum -c -',
        'tar -xzf "$work/bundle.tar.gz" --no-same-owner -C "$work"',
        f'bash "$work/install-release.sh" "$work/fieldwork.jar" {shlex.quote(release)}',
    ]


def aws(*args, check=True):
    result = subprocess.run(['aws', *args, '--no-cli-pager'], capture_output=True, text=True)
    if check and result.returncode:
        raise RuntimeError(result.stderr.strip())
    return result


def deploy(config):
    release = release_id(os.environ)
    bundle = Path('backend-release.tar.gz')
    digest = checksum(bundle)
    uri = f"s3://{config['DEPLOY_BUCKET']}/backend/{release}/backend-release.tar.gz"
    aws('s3', 'cp', str(bundle), uri, '--sse', 'AES256', '--only-show-errors', '--region', config['AWS_REGION'])
    # A structured JSON file avoids nested shell interpolation in SSM commands.
    payload = {
        'DocumentName': 'AWS-RunShellScript',
        'InstanceIds': [config['EC2_INSTANCE_ID']],
        'TimeoutSeconds': 120,
        'Comment': f'Fieldwork release {release}',
        'Parameters': {'commands': commands(config, release, digest), 'executionTimeout': ['600']},
    }
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json') as file:
        json.dump(payload, file)
        file.flush()
        result = aws('ssm', 'send-command', '--cli-input-json', f'file://{file.name}', '--region', config['AWS_REGION'], '--output', 'json')
    command_id = json.loads(result.stdout)['Command']['CommandId']
    print(f'SSM command submitted: {command_id}', flush=True)
    deadline = time.monotonic() + 900
    while time.monotonic() < deadline:
        result = aws('ssm', 'get-command-invocation', '--command-id', command_id,
                     '--instance-id', config['EC2_INSTANCE_ID'], '--region', config['AWS_REGION'], '--output', 'json', check=False)
        if result.returncode:
            if 'InvocationDoesNotExist' not in result.stderr:
                raise RuntimeError(result.stderr.strip())
        else:
            invocation = json.loads(result.stdout)
            status = invocation['Status']
            if status not in {'Pending', 'InProgress', 'Delayed', 'Cancelling'}:
                print(invocation.get('StandardOutputContent', ''))
                print(invocation.get('StandardErrorContent', ''), file=sys.stderr)
                if status != 'Success' or invocation.get('ResponseCode') != 0:
                    raise RuntimeError(f'EC2 deployment failed: {status}. Inspect SSM command {command_id}.')
                print(f'Deployment successful: {release}')
                return
        time.sleep(10)
    raise RuntimeError(f'Timed out waiting for SSM command {command_id}; check its state before retrying.')


if __name__ == '__main__':
    try:
        config = configuration(os.environ)
        if sys.argv[1:] == ['validate']:
            print('Deployment configuration is valid.')
        elif sys.argv[1:] == ['deploy']:
            deploy(config)
        else:
            raise ValueError('Usage: ssm_deploy.py validate|deploy')
    except (ValueError, RuntimeError, OSError) as error:
        sys.exit(str(error))
