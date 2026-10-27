"""Run a user-provided Core ML model with CPU+Neural Engine scheduling (no GPU)."""
import argparse
import json
from pathlib import Path
import coremltools as ct
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument("--model", required=True)
parser.add_argument("--inputs", required=True)
parser.add_argument("--output", required=True)
args = parser.parse_args()
model_path = Path(args.model).expanduser().resolve(strict=True)
values = json.loads(Path(args.inputs).read_text())
if not isinstance(values, dict):
    raise ValueError("Inputs JSON must be an object mapping feature names to scalars/arrays")
inputs = {key: np.asarray(value, dtype=np.float32) if isinstance(value, list) else value for key, value in values.items()}
policy = ct.ComputeUnit.CPU_AND_NE
if model_path.suffix == ".mlmodelc":
    model = ct.models.CompiledMLModel(str(model_path), compute_units=policy)
else:
    model = ct.models.MLModel(str(model_path), compute_units=policy)
outputs = model.predict(inputs)
result = {key: value.tolist() if isinstance(value, np.ndarray) else value for key, value in outputs.items()}
Path(args.output).write_text(json.dumps(result, ensure_ascii=False, default=str))
devices = [type(d).__name__ for d in ct.models.MLModel.get_available_compute_devices()]
print(json.dumps({"output": args.output, "availableDevices": devices, "computePolicy": "CPU_AND_NE", "note": "Core ML chooses CPU/ANE per operation. This does not prove every operation ran on ANE."}))
