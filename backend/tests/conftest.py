"""Global pytest configuration and environment setup."""
import os

# Set environment variables for the test suite before any modules are loaded
os.environ["FIRASA_ENV"] = "test"
os.environ["FIRASA_AUTH_MODE"] = "local"
os.environ["FIRASA_LLM_PROVIDER"] = "stub"
os.environ["FIRASA_DEBUG"] = "true"
