"use client";

import { Suspense, useState } from "react";
import { MessageSquare, Plus, Sparkles } from "lucide-react";
import InterviewAssistant from "@/components/InterviewAssistant";
import InterviewBoard from "@/components/InterviewBoard";
import ScheduleInterviewForm from "@/components/ScheduleInterviewForm";
import SendCallerMessage from "@/components/SendCallerMessage";
import { useToast } from "@/components/Alerts";
import { noticeParts } from "@/components/interviews";
import { Modal, PageHeader } from "@/components/ui";

export default function Page() {
  // Admins schedule for any caller; profile managers for the callers assigned to their profiles.
  const [creating, setCreating] = useState<{ day?: string } | null>(null);
  const toast = useToast();
  const [messaging, setMessaging] = useState(false);
  const [assistant, setAssistant] = useState(false);
  const [version, setVersion] = useState(0);
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Interviews (Schedule)"
        subtitle="Every interview request and schedule for your profiles: who is conducting each interview and when, and which requests still need a caller."
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => setAssistant(true)}>
              <Sparkles />
              Interview Assistant
            </button>
            <button className="btn btn-secondary" onClick={() => setMessaging(true)}>
              <MessageSquare />
              Send message
            </button>
            <button className="btn btn-primary" onClick={() => setCreating({})}>
              <Plus />
              Schedule interview
            </button>
          </>
        }
      />
      {creating && (
        <Modal open wide onClose={() => setCreating(null)} title="Schedule an interview">
          <ScheduleInterviewForm
            day={creating.day}
            onCancel={() => setCreating(null)}
            onDone={(msg) => {
              setCreating(null);
              toast.success(...noticeParts(msg));
              setVersion((v) => v + 1);
            }}
          />
        </Modal>
      )}
      {messaging && (
        <Modal open onClose={() => setMessaging(false)} title="Send a message to a caller">
          <SendCallerMessage
            onCancel={() => setMessaging(false)}
            onDone={(msg) => {
              setMessaging(false);
              toast.success(...noticeParts(msg));
            }}
          />
        </Modal>
      )}
      {assistant && <InterviewAssistant onClose={() => setAssistant(false)} />}
      <Suspense>
        <InterviewBoard as="staff" reloadSignal={version} onAddDay={(day) => setCreating({ day })} />
      </Suspense>
    </div>
  );
}
