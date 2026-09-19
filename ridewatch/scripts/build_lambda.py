"""Build a Linux/Python 3.12 ZIP on Windows or POSIX, without Docker or AWS calls."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "dist"


def allowed(path):
    return not any(part in {"__pycache__", ".venv", ".aws", "tests", "test", "node_modules"}
                   or part.startswith(".env") for part in path.parts) and path.suffix not in {".pyc", ".pyo", ".pyd"}


def validate(package):
    with ZipFile(package) as archive:
        names = archive.namelist()
        required = {"app/lambda_handler.py", "app/main.py", "mangum/__init__.py", "fastapi/__init__.py", "boto3/__init__.py"}
        assert required.issubset(names), "Required runtime modules missing"
        assert all(allowed(Path(name)) for name in names), "Forbidden package contents"
        assert not any(Path(name).name in {"credentials", ".env", "pytest.ini"} for name in names)
        native = [name for name in names if name.endswith(".so") and "pydantic_core" in name]
        assert len(native) == 1 and "cpython-312-x86_64-linux" in native[0], "Wrong native platform/ABI"
        assert archive.read(native[0]).startswith(b"\x7fELF"), "Native module is not Linux ELF"
        assert archive.testzip() is None, "ZIP integrity failure"
        unpacked = sum(info.file_size for info in archive.infolist())
    assert package.stat().st_size < 50 * 1024**2, "Package exceeds direct Lambda ZIP upload limit"
    assert unpacked < 250 * 1024**2, "Package exceeds Lambda unpacked size limit"
    return {"package": str(package), "compressed_bytes": package.stat().st_size,
            "uncompressed_bytes": unpacked, "files": len(names), "runtime": "python3.12", "architecture": "x86_64"}


def main():
    OUTPUT.mkdir(exist_ok=True)
    package = OUTPUT / "ridewatch-lambda.zip"
    # TemporaryDirectory only cleans a verified child of this project's dist directory.
    temporary = tempfile.TemporaryDirectory(prefix="lambda-build-", dir=OUTPUT)
    staging = Path(temporary.name).resolve()
    if staging.parent != OUTPUT.resolve():
        raise RuntimeError("Invalid packaging staging directory")
    try:
        subprocess.run([sys.executable, "-m", "pip", "install", "--disable-pip-version-check",
                        "--platform", "manylinux2014_x86_64", "--implementation", "cp",
                        "--python-version", "3.12", "--abi", "cp312", "--only-binary=:all:",
                        "--no-compile", "--target", str(staging),
                        "-r", str(ROOT / "backend" / "requirements-lambda.lock")], check=True)
        sources = [(path, path.relative_to(staging)) for path in staging.rglob("*") if path.is_file()]
        sources += [(path, Path("app") / path.relative_to(ROOT / "backend" / "app"))
                    for path in (ROOT / "backend" / "app").rglob("*.py")]
        with ZipFile(package, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
            for source, relative in sorted(sources, key=lambda item: item[1].as_posix()):
                if not allowed(relative):
                    continue
                info = ZipInfo(relative.as_posix(), date_time=(2020, 1, 1, 0, 0, 0))
                info.create_system = 3
                info.external_attr = 0o100644 << 16
                info.compress_type = ZIP_DEFLATED
                archive.writestr(info, source.read_bytes())
        report = validate(package)
        (OUTPUT / "lambda-package-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps(report, indent=2))
    finally:
        temporary.cleanup()


if __name__ == "__main__":
    main()
