import os
import pathlib
import subprocess
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / 'install-release.sh'
RELEASE = 'a' * 40 + '-123-1'

class InstallReleaseTest(unittest.TestCase):
    def run_deploy(self, fail=False, previous=True):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            app = root / 'app'
            app.mkdir()
            if previous:
                (app / 'fieldwork.jar').write_text('old jar')
            source = root / 'new.jar'
            source.write_text('new jar')
            bindir = root / 'bin'
            bindir.mkdir()
            for name, content in {
                'systemctl': '#!/bin/sh\necho "$*" >> "$FIELDWORK_ROOT/commands"\nexit 0\n',
                'curl': '#!/bin/sh\n' + ('exit 22\n' if fail else 'echo \'{"status":"ok"}\'\n'),
                'install': '#!/usr/bin/env python3\nimport shutil,sys\nshutil.copyfile(sys.argv[-2],sys.argv[-1])\n',
            }.items():
                file = bindir / name
                file.write_text(content)
                file.chmod(0o755)
            env = dict(os.environ, FIELDWORK_ROOT=tmp, HEALTH_ATTEMPTS='1', HEALTH_INTERVAL='0', PATH=str(bindir)+':'+os.environ['PATH'])
            result = subprocess.run(['bash', str(SCRIPT), str(source), RELEASE], env=env, capture_output=True, text=True)
            current = (app / 'fieldwork.jar').read_text() if (app / 'fieldwork.jar').exists() else None
            commands = (root / 'commands').read_text() if (root / 'commands').exists() else ''
            return result, current, commands

    def test_success_installs_jar_and_restarts_only_backend(self):
        result, current, commands = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(current, 'new jar')
        self.assertIn('start fieldwork', commands)
        self.assertNotIn('tunnel', commands)
        self.assertNotIn('postgres', commands)

    def test_failed_health_restores_previous_jar_and_reports_failure(self):
        result, current, commands = self.run_deploy(fail=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(current, 'old jar')
        self.assertIn('start fieldwork', commands)

    def test_failed_first_deploy_stops_service_without_fake_rollback(self):
        result, current, commands = self.run_deploy(fail=True, previous=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIsNone(current)
        self.assertIn('stop fieldwork', commands)

    def test_invalid_release_is_rejected_before_service_changes(self):
        result = subprocess.run(['bash', str(SCRIPT), '/missing.jar', '../bad'], capture_output=True)
        self.assertNotEqual(result.returncode, 0)

if __name__ == '__main__':
    unittest.main()
