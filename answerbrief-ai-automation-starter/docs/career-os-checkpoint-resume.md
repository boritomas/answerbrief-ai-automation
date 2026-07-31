# Career OS checkpoint resume

The browser worker persists a versioned checkpoint with each progress report.

Stored checkpoint fields:

- application ID
- completed sections
- last completed step
- current or next step
- resume URL
- screenshot evidence path
- worker status
- updated timestamp

Reports that do not include new step metadata retain the previous checkpoint. Retry reports identify the checkpoint step so the companion can reopen the saved URL and continue from the last verified point rather than restarting the application.
