# the values contract (om_extract.contract) reads its schemas from oceanmetrics/platform. om_extract looks beside its own
# checkout, which an installed (non-editable) om-extract does not have, so point it at the platform checkout beside this
# repo unless OM_SCHEMAS_DIR is already set.
import os
from pathlib import Path

_PLATFORM_SCHEMAS = Path(__file__).resolve().parents[2] / "platform" / "packages" / "catalog" / "schemas"
if not os.environ.get("OM_SCHEMAS_DIR") and _PLATFORM_SCHEMAS.is_dir():
  os.environ["OM_SCHEMAS_DIR"] = str(_PLATFORM_SCHEMAS)
