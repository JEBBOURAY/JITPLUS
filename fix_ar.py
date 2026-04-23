import sys, re

with open(r'c:\Users\ayoub\AppData\Roaming\Code\User\workspaceStorage\de4056fa1267bcc4a742927e63c08c3b\GitHub.copilot-chat\chat-session-resources\24d57f18-6149-4cfe-881a-0701520d9647\call_MHxTUUhlTXcxWE5LZFM1enBaUG8__vscode-1776429387341\content.txt', encoding='utf-8') as f:
    text = f.read()

match = re.search(r'\\\	ypescript\n(.*?)\n\\\', text, re.DOTALL)
if match:
    code = match.group(1)
    with open('apps/jitplus/i18n/locales/ar.ts', 'w', encoding='utf-8') as out:
        out.write(code)
    print('Done!')
else:
    print('No code block found!')
