# Emergent Auth Testing Playbook (for this app)

See integration_playbook_expert_v2 response.  
Quick test:
```bash
mongosh --eval "
use('test_database');
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({user_id: userId, email: 'julien.test@example.com', name: 'Julien Test', picture:'', created_at: new Date()});
db.user_sessions.insertOne({user_id: userId, session_token: sessionToken, expires_at: new Date(Date.now()+7*24*60*60*1000), created_at: new Date()});
print('Session token: '+sessionToken);
"
```
Then set cookie `session_token` and visit `/`.
