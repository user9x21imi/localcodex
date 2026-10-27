"""Report actual available runtimes; never label MLX inference as ANE inference."""
import json
import mlx.core as mx
import coremltools as ct

devices = ct.models.MLModel.get_available_compute_devices()
names = [type(device).__name__ for device in devices]
print(json.dumps({
    "backend": "MLX",
    "mlxVersion": mx.__version__,
    "mlxGpuAvailable": bool(mx.metal.is_available()),
    "coremlDevices": names,
    "neuralEngineAvailable": any("NeuralEngine" in name for name in names),
    "npuPolicy": "CPU_AND_NE for compatible Core ML tasks; GPT-OSS runs in MLX on GPU, not ANE",
}, ensure_ascii=False))
