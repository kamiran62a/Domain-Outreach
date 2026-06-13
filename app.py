from flask import Flask, request, jsonify, send_from_directory
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import anthropic
import os

app = Flask(__name__, static_folder='static')

GMAIL_USER = os.environ.get("GMAIL_USER")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")

@app.route("/")
def index():
    return send_from_directory("static", "index.html")

@app.route("/generate", methods=["POST"])
def generate():
    data = request.json
    recipient = data.get("recipient", "")
    domain = data.get("domain", "")
    btype = data.get("btype", "general")
    lang = data.get("lang", "en")
    lang_map = {"de":"German","en":"English","ar":"Arabic"}
    btype_map = {"cafe":"café","restaurant":"restaurant","taxi":"taxi company","auto":"auto/car service","startup":"tech startup","fintech":"fintech company","general":"business"}
    prompt = f"""Write a very short cold email to sell a domain. Domain: {domain}. Recipient: {recipient or '[Name]'}. Business: {btype_map.get(btype,'business')}. Language: {lang_map.get(lang,'English')}. Rules: max 5 lines, human tone, NO price, end with one question. Respond ONLY as JSON: {{"subject":"...","body":"..."}}"""
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    message = client.messages.create(model="claude-sonnet-4-6", max_tokens=500, messages=[{"role":"user","content":prompt}])
    import json
    text = message.content[0].text.replace("```json","").replace("```","").strip()
    return jsonify(json.loads(text))

@app.route("/send", methods=["POST"])
def send_email():
    data = request.json
    to_email = data.get("to_email","")
    subject = data.get("subject","")
    body = data.get("body","")
    if not to_email or not subject or not body:
        return jsonify({"error":"Missing fields"}), 400
    try:
        msg = MIMEMultipart()
        msg["From"] = GMAIL_USER
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            server.sendmail(GMAIL_USER, to_email, msg.as_string())
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
