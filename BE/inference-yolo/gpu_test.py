import torch
import sys

def main():
    print('torch version:', torch.__version__)
    cuda_available = torch.cuda.is_available()
    print('cuda available:', cuda_available)
    if cuda_available:
        try:
            device_count = torch.cuda.device_count()
            print('device count:', device_count)
            for i in range(device_count):
                name = torch.cuda.get_device_name(i)
                prop = torch.cuda.get_device_properties(i)
                print(f'device {i}:', name)
                print(f'  total memory (GB): {prop.total_memory / (1024**3):.2f}')
        except Exception as e:
            print('error inspecting CUDA devices:', e)
            sys.exit(2)
    else:
        sys.exit(1)

if __name__ == '__main__':
    main()
