from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="harboria-portid",
    version="0.1.0",
    author="Harboria Labs",
    author_email="contact@harboria.com",
    description="A client-side SDK for a zero-knowledge, decentralized user data sync system.",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/Harboria-Labs/PortID",
    packages=find_packages(),
    install_requires=[
        "requests",
        "pycryptodome",
    ],
    license_files=["LICENSE"],
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Topic :: Security :: Cryptography",
        "Topic :: Software Development :: Libraries :: Python Modules",
    ],
    python_requires='>=3.6',
)