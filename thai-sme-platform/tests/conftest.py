import os
import tempfile

# Isolated database and media folder for every test run (set before webapp imports).
os.environ["DB_PATH"] = ":memory:"
os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="sme-test-")
os.environ.setdefault("ADMIN_KEY", "test-key")
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.pop("ANTHROPIC_API_KEY", None)
os.environ.pop("LINE_CHANNEL_ACCESS_TOKEN", None)
