def tiny_photo_data_url() -> str:
    import base64
    from io import BytesIO
    from PIL import Image
    buf = BytesIO()
    Image.new("RGB", (60, 60), (200, 30, 30)).save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
