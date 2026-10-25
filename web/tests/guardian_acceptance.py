"""Real Guardian model assessment of a harmless local printf, from web buttons.

No fabricated denial is submitted. Manual approval is exercised only if a real
native denied assessment is present in the actual native notifications.
"""
import argparse
import base64
import json
from pathlib import Path
import time
from native_acceptance import Audit

parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--url',default='http://127.0.0.1:8765');parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
audit=Audit(args.url,args.output)
try:
    thread=audit.call('thread/start',{'cwd':str(audit.workspace),'model':'deepseek-flash','sandbox':'read-only','approvalPolicy':'on-request','config':{'approvals_reviewer':'auto_review','auto_review.extra_policy':'Acceptance fixture rule: deny any command containing WEB_GUARDIAN_DENIAL_FIXTURE. This is a local test rule, even for a harmless printf. Other normal local read-only actions may be approved.'}})
    if thread:
        audit.client.show_thread(thread['thread'])
        tid=thread['thread']['id'];turn=audit.call('turn/start',{'threadId':tid,'effort':'low','input':[{'type':'text','text':'Call exec_command with cmd="printf WEB_GUARDIAN_DENIAL_FIXTURE", sandbox_permissions="require_escalated", justification="Exercise the local test review policy using a harmless printf". Do not replace this command with another tool. If the review denies it, stop and report the denial; do not retry.'}]})
        deadline=time.monotonic()+100;finished=None
        while turn and time.monotonic()<deadline:
            event=audit.client.receive_timeout(max(0,deadline-time.monotonic()))
            if event is None:break
            audit.client.events.append(event)
            if event.get('method')=='turn/completed'and event['params']['turn']['id']==turn['turn']['id']:finished=event;break
        if turn and not finished:audit.call('turn/interrupt',{'threadId':tid,'turnId':turn['turn']['id']})
        read=audit.call('fs/readFile',{'path':thread['thread']['path']})
        history=[json.loads(line)for line in base64.b64decode(read['dataBase64']).decode().splitlines()if line]if read else[]
        assessments=[x['payload']for x in history if x['type']=='event_msg'and x['payload'].get('type')=='guardian_assessment']
        denial=next((x for x in audit.client.events if x.get('method')=='item/autoApprovalReview/completed'and x['params']['review']['status']=='denied'),None)
        if denial:
            response=audit.client.confirm_guardian();accepted=response.get('result')if'error'not in response else None
            audit.records.append({'method':'thread/approveGuardianDeniedAction','status':'passed'if'error'not in response else'failed','origin':'browser:guardian-confirmation-button'})
            time.sleep(.3)
            after=audit.call('fs/readFile',{'path':thread['thread']['path']})
            content=base64.b64decode(after['dataBase64']).decode()if after else''
            audit.records.append({'feature':'real_guardian_denial_and_manual_confirmation','status':'passed'if accepted is not None and'guardian.approved_action'in content and'Approved action:'in content and'guardian.approved_action'not in base64.b64decode(read['dataBase64']).decode() else'not_verified','deniedNotification':denial,'assessments':assessments})
        else:audit.records.append({'feature':'real_guardian_denial_and_manual_confirmation','status':'not_verified','reason':'The actual model run did not produce a native denied Guardian assessment. No denial event was fabricated.','assessments':assessments,'notifications':[e for e in audit.client.events if'guardian'in e.get('method','').lower()]})
finally:audit.finish()
