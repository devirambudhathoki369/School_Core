// app.json holds the app's settings; this adds the ones that come from the
// environment.
//
// google-services.json (Firebase, for push on Android) is kept out of the
// repo because the repo is public. Locally it is mobile/google-services.json.
// EAS builds get it from the GOOGLE_SERVICES_JSON file variable (RELEASE.md §2).
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
});
