import requests
import os


def send_sms(contact, data, api_key, school=None):
    """
    Single-recipient send (the OTP path).

    `school` is what files the message on that school's SMS report. The report
    shows the send but NOT the code — see OTP_MESSAGE_PLACEHOLDER; the school's
    admins can see that an OTP went out and to which number, which is what they
    need to support a parent, without being handed a live login code.
    """
    API = os.environ.get("SMS_API")
    # TOKEN = os.environ.get("SMS_TOKEN")
    # lazy imports: this module is imported by account.serializers, which the
    # main app's models import chain reaches during app loading.
    from main.methods.smsLog import record_sms
    from main.models.SMSLog import SMS_TYPE_OTP

    try:
        res = requests.post(
            API,
            {"auth_token": api_key, "to": contact, "text": data},
            timeout=(5, 45),
        )
        if res.status_code < 400:
            # lazy import to avoid an account <-> main import cycle
            from main.views.sms.SMSViews import refresh_credits_for_api_key

            refresh_credits_for_api_key(api_key)
        try:
            body = res.json()
        except ValueError:
            body = None
        record_sms(
            school,
            SMS_TYPE_OTP,
            contact,
            data,
            response=body,
            failed=res.status_code >= 400,
        )
    except Exception as e:
        # print(e)
        record_sms(school, SMS_TYPE_OTP, contact, data, failed=True)
