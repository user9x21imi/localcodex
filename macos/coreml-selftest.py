"""Verify Core ML execution under CPU_AND_NE. Scheduling is not an ANE utilization proof."""
import json
import coremltools as ct
import numpy as np
from coremltools.models import datatypes
from coremltools.models.neural_network import NeuralNetworkBuilder

builder = NeuralNetworkBuilder([("x", datatypes.Array(16, 16, 16))], [("y", datatypes.Array(16, 16, 16))])
weights = np.full((1, 1, 16, 16), 1 / 16, dtype=np.float32)
builder.add_convolution("mean_channels", 16, 16, 1, 1, 1, 1, "valid", 1, weights, None, False, input_name="x", output_name="y")
model = ct.models.MLModel(builder.spec, compute_units=ct.ComputeUnit.CPU_AND_NE)
x = np.arange(4096, dtype=np.float32).reshape(16, 16, 16) / 4096
y = np.asarray(model.predict({"x": x})["y"]).squeeze()
expected = np.broadcast_to(x.mean(axis=0), x.shape)
np.testing.assert_allclose(y, expected, rtol=0.02, atol=0.005)
devices = [type(d).__name__ for d in ct.models.MLModel.get_available_compute_devices()]
print(json.dumps({"test": "passed", "computePolicy": "CPU_AND_NE", "devices": devices, "note": "CPU fallback is permitted; this is not an ANE utilization benchmark."}))
