NOTIFICATION_CONFIG = {
    "android": {
        "priority": "high",
        "notification": {
            "channel_id": "high_importance_channel",
        },
    },
    #
    "apns": {
        "headers": {
            "apns-priority": "10",  # high
        },
        "payload": {
            "aps": {
                "badge": 1,
            }
        },
    },
}
