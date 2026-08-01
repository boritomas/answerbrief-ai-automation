Backup checkpoint before correcting shell error handling in the package-lock self-repair step.

Workflow commit before correction: debbc8e398aa739a3fccc2bb6a62bb4252d64e0d
Workflow blob before correction: ab0cf4f1c9861bc41cb3aada9488c13be9e30b47
Issue: set -e exits immediately when the manifest comparison intentionally returns status 42, preventing npm lockfile regeneration.
