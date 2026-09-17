from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent
W, H = 1920, 1080
BG = (243, 239, 230)
SURFACE = (255, 253, 248)
TEAL = (15, 95, 82)
INK = (27, 42, 36)
MUTED = (93, 107, 100)
DARK = (20, 53, 46)
LINE = (216, 208, 194)
SOFT = (220, 238, 232)


def font(size, bold=False):
    names = [
        "C:/Windows/Fonts/segoeui.ttf" if not bold else "C:/Windows/Fonts/segoeuib.ttf",
        "C:/Windows/Fonts/palatino.ttf",
        "C:/Windows/Fonts/times.ttf",
    ]
    for name in names:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def round_rect(draw, xy, r, fill, outline=None, width=1):
    draw.rounded_rectangle(xy, radius=r, fill=fill, outline=outline, width=width)


def arrow_down(draw, x, y):
    draw.line((x, y, x, y + 18), fill=TEAL, width=2)
    draw.polygon([(x - 6, y + 18), (x + 6, y + 18), (x, y + 30)], fill=TEAL)


def flowchart():
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.text((80, 40), "MediCare+ architecture", font=font(36, True), fill=INK)
    d.text((80, 88), "Website structure and healthcare workflow — original plan preserved", font=font(18), fill=MUTED)

    round_rect(d, (60, 130, 960, 1040), 24, SURFACE, LINE, 2)
    d.text((90, 155), "WEBSITE / SITEMAP", font=font(14, True), fill=TEAL)
    round_rect(d, (90, 195, 340, 250), 12, TEAL)
    d.text((115, 210), "index.html", font=font(20, True), fill=(255, 255, 255))

    patients = [
        "login.html", "register.html", "dashboard.html", "appointments.html",
        "book-appointment.html", "prescriptions.html", "medications.html",
        "medical-history.html", "notifications.html", "profile.html", "settings.html",
    ]
    doctors = [
        "login.html", "register.html", "dashboard.html", "appointments.html",
        "consultation.html", "prescriptions.html", "profile.html",
    ]
    info = ["how-it-works.html", "security.html", "privacy.html", "terms.html"]

    round_rect(d, (90, 280, 400, 980), 16, SOFT)
    d.text((110, 300), "Patient", font=font(20, True), fill=INK)
    for i, name in enumerate(patients):
        d.text((110, 340 + i * 28), name, font=font(16), fill=INK)

    round_rect(d, (430, 280, 720, 620), 16, (232, 241, 238))
    d.text((450, 300), "Doctor", font=font(20, True), fill=INK)
    for i, name in enumerate(doctors):
        d.text((450, 340 + i * 28), name, font=font(16), fill=INK)

    round_rect(d, (750, 280, 930, 390), 16, SURFACE, LINE, 1)
    d.text((770, 300), "Doctors", font=font(20, True), fill=INK)
    d.text((770, 340), "index.html", font=font(16), fill=INK)

    round_rect(d, (750, 420, 930, 620), 16, SURFACE, LINE, 1)
    d.text((770, 440), "Information", font=font(20, True), fill=INK)
    for i, name in enumerate(info):
        d.text((770, 480 + i * 28), name, font=font(16), fill=INK)

    round_rect(d, (1000, 130, 1860, 1040), 24, SURFACE, LINE, 2)
    d.text((1030, 155), "HEALTHCARE WORKFLOW", font=font(14, True), fill=TEAL)
    steps = [
        ("Patient login", False),
        ("Find doctor", False),
        ("Book appointment", False),
        ("Doctor appointment", True),
        ("Authorized consultation", True),
        ("Prescription", False),
        ("Automatic medication schedule", False),
        ("Medication reminder", False),
        ("Medical history", False),
    ]
    y = 210
    for label, dark in steps:
        fill = DARK if dark else SOFT
        color = (255, 255, 255) if dark else INK
        round_rect(d, (1180, y, 1680, y + 54), 14, fill)
        d.text((1210, y + 14), label, font=font(20, True), fill=color)
        if label != steps[-1][0]:
            arrow_down(d, 1430, y + 54)
        y += 86
    d.text((1030, 990), "Time-limited doctor access is enforced with server time, never the browser clock.", font=font(16), fill=MUTED)
    img.save(OUT / "medicare-flowchart.png", "PNG")


def database():
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.text((80, 36), "MediCare+ database", font=font(36, True), fill=INK)
    d.text((80, 84), "Approved entities with supporting email tokens", font=font(18), fill=MUTED)

    def box(x, y, w, h, label, fill, color=INK):
        round_rect(d, (x, y, x + w, y + h), 14, fill, LINE if fill != TEAL and fill != DARK else fill, 1)
        d.text((x + 18, y + h / 2 - 12), label, font=font(18, True), fill=color)

    box(820, 120, 260, 70, "Users", TEAL, (255, 255, 255))
    box(250, 260, 260, 64, "Patient Profiles", SURFACE)
    box(1390, 260, 260, 64, "Doctor Profiles", DARK, (255, 255, 255))
    box(1390, 390, 260, 64, "Doctor Availability", SURFACE)
    box(820, 500, 260, 70, "Appointments", TEAL, (255, 255, 255))
    box(820, 630, 260, 60, "Consultations", SURFACE)
    box(820, 740, 260, 60, "Prescriptions", SURFACE)
    box(790, 850, 320, 60, "Prescription Medicines", SURFACE)
    box(390, 850, 280, 60, "Medication Schedules", SURFACE)
    box(1220, 850, 240, 60, "Notifications", SURFACE)
    box(80, 630, 240, 60, "Medical History", SURFACE)
    box(80, 120, 220, 60, "Audit Logs", SURFACE)
    box(1600, 120, 230, 60, "Email Tokens", SURFACE)

    def line(a, b):
        d.line([a, b], fill=TEAL, width=2)

    line((950, 190), (950, 220))
    line((380, 220), (1520, 220))
    line((380, 220), (380, 260))
    line((1520, 220), (1520, 260))
    line((1520, 324), (1520, 390))
    line((380, 324), (380, 535))
    line((380, 535), (820, 535))
    line((1520, 454), (1520, 535))
    line((1080, 535), (1520, 535))
    line((950, 570), (950, 630))
    line((950, 690), (950, 740))
    line((950, 800), (950, 850))
    line((790, 880), (670, 880))
    line((1110, 880), (1220, 880))
    line((200, 660), (380, 535))
    line((200, 150), (820, 150))
    line((1080, 150), (1600, 150))
    d.text((80, 1020), "Users 1:1 profiles  ·  Appointments join patients and doctors  ·  Consultation → prescription → medicines → schedules", font=font(16), fill=MUTED)
    img.save(OUT / "medicare-database-diagram.png", "PNG")


if __name__ == "__main__":
    flowchart()
    database()
    print("wrote diagrams")
