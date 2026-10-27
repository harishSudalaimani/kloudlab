# Display Auth0 usernames in KloudLab

KloudLab displays the username when Auth0 includes it in the ID token. Requiring a username on the database connection does not necessarily include it in the profile returned to the browser. Add it with a Post-Login Action:

```js
exports.onExecutePostLogin = async (event, api) => {
  const username = event.user.username
  if (username) {
    // Replace this with a namespace URL associated with your application.
    api.idToken.setCustomClaim('https://YOUR-APP-DOMAIN/username', username)
  }
}
```

In the Auth0 Dashboard, create a **Post-Login Action**, paste the code, replace the placeholder namespace, then **Deploy** it and add it to the **Login** flow. The claim name must end in `/username`; KloudLab reads that claim and shows it in the header. Log out and sign in again to receive a fresh ID token.

Auth0 recommends namespaced custom claims in tokens. KloudLab still uses Auth0's stable `sub` claim as the user's internal identity; the username is for display.
