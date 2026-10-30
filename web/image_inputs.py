"""Validate browser image inputs before forwarding to the native app-server.

Container signatures are checked here; browser and native decoders validate the
image itself. No document parser, upload store, or extra imaging dependency.
"""
import base64
import binascii
import re

IMAGE_BUDGET = 16 * 1024 * 1024
IMAGE_URL = re.compile(r'^data:(image/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]*={0,2})$')


def image_mime(data):
    if len(data) >= 24 and data[:8] == b'\x89PNG\r\n\x1a\n' and data[12:16] == b'IHDR':
        return 'image/png'
    if len(data) >= 12 and data[:3] == b'\xff\xd8\xff' and data[-2:] == b'\xff\xd9':
        return 'image/jpeg'
    if len(data) >= 14 and data[:6] in (b'GIF87a', b'GIF89a') and data[-1:] == b';':
        return 'image/gif'
    if (len(data) >= 20 and data[:4] == b'RIFF' and data[8:12] == b'WEBP'
            and data[12:16] in (b'VP8 ', b'VP8L', b'VP8X')
            and int.from_bytes(data[4:8], 'little') + 8 == len(data)):
        return 'image/webp'
    return None


def image_input_size(url):
    if not isinstance(url, str) or len(url) > ((IMAGE_BUDGET + 2) // 3) * 4 + 64:
        raise ValueError('图片超出 16 MiB 限制，或图片输入无效。')
    match = IMAGE_URL.fullmatch(url)
    if not match:
        raise ValueError('只允许 PNG、JPEG、GIF、WebP 图片附件；请通过图片按钮重新添加。')
    try:
        data = base64.b64decode(match[2], validate=True)
    except (ValueError, binascii.Error):
        raise ValueError('图片编码无效，请重新添加。') from None
    if not data or len(data) > IMAGE_BUDGET or image_mime(data) != match[1]:
        raise ValueError('图片内容与格式不符或超出限制；不接受其他文件改名为图片。')
    return len(data)


def image_inputs_reason(inputs):
    total = 0
    for item in inputs if isinstance(inputs, list) else []:
        if not isinstance(item, dict):
            continue  # Native protocol reports unrelated malformed input.
        if item.get('type') in ('audio', 'localImage', 'file', 'document'):
            return '仅允许上传图片；不接受音频、文档或本地文件路径附件。'
        if item.get('type') == 'image':
            try:
                total += image_input_size(item.get('url'))
            except ValueError as error:
                return str(error)
    if total > IMAGE_BUDGET:
        return '本次图片总量超过 16 MiB，请减少图片后重试；输入与附件已保留。'
    return None
