import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('release', ROOT / 'scripts/prepare-release.py')
if spec is None or spec.loader is None:
    raise RuntimeError('Release script not found')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseTest(unittest.TestCase):
    def test_runtime_and_private_exclusion(self):
        files = release.read_files(ROOT, release.RUNTIME)
        self.assertEqual(len(files), 14)
        self.assertEqual(release.validate_runtime(files), '0.1.6')
        source = release.public_files(ROOT)
        self.assertNotIn('docs/UI_HANDOFF.md', source)
        self.assertFalse(any(name.startswith(('docs/research/', '.git/', 'dist/')) for name in source))
        self.assertIn('LICENSE', source)
        self.assertIn('PRIVACY.md', source)

    def test_invalid_manifest(self):
        with self.assertRaisesRegex(ValueError, 'invalid release manifest'):
            release.validate_runtime({'manifest.json': b'{invalid'})

    def test_private_content_and_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / 'note.md'
            for text in ['/' + 'Users/private/session', 'ghp_' + 'x' * 30]:
                path.write_text(text)
                with self.assertRaisesRegex(ValueError, 'Private path / credential'):
                    release.read_files(root, ['note.md'])
            (root / 'linked.md').symlink_to(path)
            with self.assertRaisesRegex(ValueError, 'Unsafe source path'):
                release.read_files(root, ['linked.md'])


if __name__ == '__main__':
    unittest.main()
