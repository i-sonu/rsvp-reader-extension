import struct
import zlib
import os

def create_png(width, height, pixels):
    """Create a minimal PNG file from pixel data."""
    def chunk(chunk_type, data):
        c = chunk_type + data
        crc = struct.pack('>I', zlib.crc32(c) & 0xffffffff)
        return struct.pack('>I', len(data)) + c + crc
    
    signature = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)  # 8-bit RGBA
    
    raw_data = b''
    for y in range(height):
        raw_data += b'\x00'  # filter byte
        for x in range(width):
            r, g, b, a = pixels[y * width + x]
            raw_data += struct.pack('BBBB', r, g, b, a)
    
    compressed = zlib.compress(raw_data, 9)
    
    return signature + chunk(b'IHDR', ihdr) + chunk(b'IDAT', compressed) + chunk(b'IEND', b'')

def draw_icon(size):
    """Draw the RSVP icon at given size."""
    pixels = []
    bg = (26, 26, 46, 255)       # #1a1a2e
    red = (255, 51, 51, 255)     # #ff3333
    white = (224, 224, 224, 255)  # #e0e0e0
    dim = (100, 100, 140, 255)   # dimmed
    
    center = size / 2
    
    for y in range(size):
        for x in range(size):
            # Background
            pixel = bg
            
            # Draw a stylized eye shape
            dx = (x - center) / (size * 0.35)
            dy = (y - center) / (size * 0.2)
            
            # Eye outline (ellipse)
            eye_dist = dx * dx + dy * dy
            
            if eye_dist < 1.0:
                # Inside eye - lighter
                pixel = (30, 30, 55, 255)
                
                # Inner circle (iris)
                iris_dx = (x - center) / (size * 0.15)
                iris_dy = (y - center) / (size * 0.15)
                iris_dist = iris_dx * iris_dx + iris_dy * iris_dy
                
                if iris_dist < 1.0:
                    pixel = dim
                    
                    # Pupil / anchor dot
                    pupil_dx = (x - center) / (size * 0.07)
                    pupil_dy = (y - center) / (size * 0.07)
                    pupil_dist = pupil_dx * pupil_dx + pupil_dy * pupil_dy
                    
                    if pupil_dist < 1.0:
                        pixel = red
            
            # Eye outline border
            if 0.85 < eye_dist < 1.15:
                pixel = white
            
            # Rounded corners - make transparent outside circle
            corner_dx = (x - center) / (size * 0.46)
            corner_dy = (y - center) / (size * 0.46)
            if corner_dx * corner_dx + corner_dy * corner_dy > 1.0:
                pixel = bg
            
            pixels.append(pixel)
    
    return pixels

# Generate icons
script_dir = os.path.dirname(os.path.abspath(__file__))
icons_dir = os.path.join(script_dir, 'icons')
os.makedirs(icons_dir, exist_ok=True)

for size in [16, 48, 128]:
    pixels = draw_icon(size)
    png_data = create_png(size, size, pixels)
    path = os.path.join(icons_dir, f'icon{size}.png')
    with open(path, 'wb') as f:
        f.write(png_data)
    print(f'Created {path} ({len(png_data)} bytes)')

print('Done!')
