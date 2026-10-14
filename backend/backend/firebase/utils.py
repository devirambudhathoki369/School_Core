import os
from google.oauth2 import service_account
from google.auth.transport.requests import Request

SERVICE_ACCOUT_PATH = os.environ.get("SERVICE_ACCOUNT_PATH")
SCOPES = ["https://www.googleapis.com/auth/firebase.messaging"]


def get_access_token():
    credentials = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUT_PATH, scopes=SCOPES
    )
    credentials.refresh(Request())
    return credentials.token
