import hashlib
import importlib.util
import pathlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('ssm_deploy', pathlib.Path(__file__).resolve().parents[1] / 'ssm_deploy.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class SsmDeployTest(unittest.TestCase):
    def test_missing_or_injected_configuration_fails_closed(self):
        with self.assertRaises(ValueError):
            module.configuration({})
        with self.assertRaises(ValueError):
            module.release_id({'GITHUB_SHA': 'a'*40, 'GITHUB_RUN_ID': '1; touch /tmp/bad', 'GITHUB_RUN_ATTEMPT': '1'})

    def test_bundle_integrity_checked_before_remote_execution(self):
        with tempfile.TemporaryDirectory() as directory:
            path=pathlib.Path(directory)/'bundle'
            path.write_bytes(b'original')
            digest=hashlib.sha256(b'original').hexdigest()
            pathlib.Path(str(path)+'.sha256').write_text(digest+'  bundle\n')
            self.assertEqual(module.checksum(path),digest)
            path.write_bytes(b'changed')
            with self.assertRaises(ValueError):
                module.checksum(path)

    def test_remote_script_verifies_checksum_before_extract_and_install(self):
        config=module.configuration({'AWS_REGION':'ap-northeast-2','DEPLOY_BUCKET':'test-fieldwork-releases','EC2_INSTANCE_ID':'i-0123456789abcdef0','AWS_DEPLOY_ROLE_ARN':'arn:aws:iam::123456789012:role/test-role'})
        script='\n'.join(module.commands(config,'a'*40+'-1-1','b'*64))
        self.assertLess(script.index('sha256sum -c'),script.index('tar -xzf'))
        self.assertLess(script.index('tar -xzf'),script.index('bash "$work/install-release.sh"'))
        self.assertNotIn('backend.env',script)
        self.assertNotIn('docker',script)
