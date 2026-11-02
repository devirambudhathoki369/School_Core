def pretty_byte_size(size_bytes):
    if size_bytes < 1024:
        return f"{size_bytes:5d} B"

    size_name = ("B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB")
    bit_length = size_bytes.bit_length() - 1
    index = bit_length // 10
    denominator = 1 << (10 * index)
    ratio = size_bytes / denominator
    return f"{ratio:5.1f} {size_name[index]}"
