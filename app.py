from flask import Flask, request, jsonify, send_from_directory
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import anthropic
import os
import json

app = Flask(__name__, static_folder='static')

GMAIL_USER = os.environ.get("GMAIL_USER")
GMAIL_PASS = os.environ.get("GMAIL_APP_PASSWORD")
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY")

@app.route("/")
def index():
    return send_from_directory("static", "index.html")

@app.route("/generate", methods=["POST"])
def generate():
    d = request.json
    recipient = d.get("recipient", "")
    domain = d.get("domain", "")
    btype = d.get("btype", "general")
    lang = d.get("lang", "en")

    lang_map = {"de": "German", "en": "English", "ar": "Arabic"}
    btype_map = {
        "cafe": "cafe or coffee shop",
        "restaurant": "restaurant",
        "taxi": "taxi company",
        "auto": "auto or car service",
        "startup": "tech startup",
        "fintech": "fintech company",
        "general": "business"
    }

    prompt = (
        "Write a very short cold email to sell a domain name. "
        "Domain: " + domain + ". "
        "Recipient name: " + (recipient or "[Name]") + ". "
        "Business type: " + btype_map.get(btype, "business") + ". "
        "Language: " + lang_map.get(lang, "English") + ". "
        "Rules: max 5 lines, human tone, NO price, end with one question. "
        "Respond ONLY as JSON with no extra text: {\"subject\":\"...\",\"body\":\"...\"}"
    )

    client = anthropic.Anthropic(api_key=ANTHROPIC_KEY)
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}]
    )
    text = msg.content[0].text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return jsonify(json.loads(text.strip()))

@app.route("/send", methods=["POST"])
def send_email():
    d = request.json
    to_email = d.get("to_email", "")
    subject = d.get("subject", "")
    body = d.get("body", "")

    if not to_email or not subject or not body:
        return jsonify({"error": "Missing fields"}), 400

    try:
        msg = MIMEMultipart()
        msg["From"] = GMAIL_USER
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))

        with smtplib.SMTP("smtp.gmail.com", 587, timeout=30) as s:
            s.ehlo()
            s.starttls()
            s.ehlo()
            s.login(GMAIL_USER, GMAIL_PASS)
            s.sendmail(GMAIL_USER, to_email, msg.as_string())

        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
