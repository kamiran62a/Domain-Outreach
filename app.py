from flask import Flask, request, jsonify, send_from_directory, redirect, session, url_for
import anthropic
import os
import json
import base64
from email.mime.text import MIMEText
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

app = Flask(__name__, static_folder='static')
app.secret_key = os.urandom(24)

ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY")
CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET")
REDIRECT_URI = "https://domain-outreach-production.up.railway.app/oauth2callback"
SCOPES = ["https://www.googleapis.com/auth/gmail.send"]

@app.route("/")
def index():
    return send_from_directory("static", "index.html")

@app.route("/auth")
def auth():
    flow = Flow.from_client_config(
        {"web": {"client_id": CLIENT_ID, "client_secret": CLIENT_SECRET,
                 "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                 "token_uri": "https://oauth2.googleapis.com/token"}},
        scopes=SCOPES, redirect_uri=REDIRECT_URI)
    url, state = flow.authorization_url(prompt="consent")
    session["state"] = state
    return redirect(url)

@app.route("/oauth2callback")
def oauth2callback():
    flow = Flow.from_client_config(
        {"web": {"client_id": CLIENT_ID, "client_secret": CLIENT_SECRET,
                 "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                 "token_uri": "https://oauth2.googleapis.com/token"}},
        scopes=SCOPES, redirect_uri=REDIRECT_URI, state=session.get("state"))
    flow.fetch_token(authorization_response=request.url)
    creds = flow.credentials
    session["token"] = creds.token
    session["refresh_token"] = creds.refresh_token
    return redirect("/")

@app.route("/generate", methods=["POST"])
def generate():
    d = request.json
    recipient = d.get("recipient", "")
    domain = d.get("domain", "")
    btype = d.get("btype", "general")
    lang = d.get("lang", "en")
    lang_map = {"de": "German", "en": "English", "ar": "Arabic"}
    btype_map = {"cafe": "cafe", "restaurant": "restaurant", "taxi": "taxi company",
                 "auto": "auto service", "startup": "tech startup", "fintech": "fintech", "general": "business"}
    prompt = ("Write a very short cold email to sell a domain. "
              "Domain: " + domain + ". Recipient: " + (recipient or "[Name]") + ". "
              "Business: " + btype_map.get(btype, "business") + ". Language: " + lang_map.get(lang, "English") + ". "
              "Rules: max 5 lines, human tone, NO price, end with one question. "
              'Respond ONLY as JSON: {"subject":"...","body":"..."}')
    client = anthropic.Anthropic(api_key=ANTHROPIC_KEY)
    msg = client.messages.create(model="claude-haiku-4-5-20251001", max_tokens=500,
                                  messages=[{"role": "user", "content": prompt}])
    text = msg.content[0].text.strip().replace("```json", "").replace("```", "")
    return jsonify(json.loads(text.strip()))

@app.route("/send", methods=["POST"])
def send_email():
    if "token" not in session:
        return jsonify({"error": "not_authorized", "auth_url": "/auth"}), 401
    d = request.json
    to_email = d.get("to_email", "")
    subject = d.get("subject", "")
    body = d.get("body", "")
    if not to_email or not subject or not body:
        return jsonify({"error": "Missing fields"}), 400
    try:
        creds = Credentials(token=session["token"],
                            refresh_token=session.get("refresh_token"),
                            client_id=CLIENT_ID, client_secret=CLIENT_SECRET,
                            token_uri="https://oauth2.googleapis.com/token")
        service = build("gmail", "v1", credentials=creds)
        msg = MIMEText(body)
        msg["To"] = to_email
        msg["Subject"] = subject
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
        service.users().messages().send(userId="me", body={"raw": raw}).execute()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
