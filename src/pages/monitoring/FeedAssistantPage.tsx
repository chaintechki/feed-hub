import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import analystIcon from "@/assets/feed-analyst.png";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { MonitorSubBar } from "@/components/monitoring/MonitorSubBar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/feed-assistant`;

function ChatWindow({ initial }: { initial: UIMessage[] }) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: ENDPOINT,
        headers: async () => {
          const { data } = await supabase.auth.getSession();
          return {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${data.session?.access_token ?? ""}`,
          };
        },
        // Server loads history from the database; only send the new message.
        prepareSendMessagesRequest: ({ messages }) => ({ body: { messages: messages.slice(-1) } }),
      }),
    [],
  );
  const { messages, sendMessage, status, stop, setMessages } = useChat({
    id: "feed-assistant",
    messages: initial,
    transport,
    onError: (e) => {
      const m = e.message ?? "";
      toast.error(m.includes("429") || /Zu viele/.test(m) ? t("assistant.rateLimited") : m.includes("402") ? t("assistant.noCredits") : t("assistant.failed"));
    },
  });
  const busy = status === "submitted" || status === "streaming";

  async function reset() {
    const { error } = await supabase.from("ai_chat_messages").delete().neq("message_id", "");
    if (error) return toast.error(t("assistant.failed"));
    setMessages([]);
  }

  function ask(q: string) {
    if (!q.trim() || busy) return;
    sendMessage({ text: q.trim() });
    setText("");
  }

  const examples = [t("assistant.ex1"), t("assistant.ex2"), t("assistant.ex3")];

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col px-4 pb-4">
      <div className="flex items-center justify-between border-b border-border py-2">
        <div className="flex items-center gap-2">
          <img src={analystIcon} alt="" className="h-7 w-7" />
          <div>
            <div className="text-[13px] font-bold">{t("assistant.title")}</div>
            <div className="text-[11px] text-muted-foreground">{t("assistant.subtitle")}</div>
          </div>
        </div>
        <button
          onClick={reset}
          disabled={busy || messages.length === 0}
          className="flex h-7 items-center gap-1.5 rounded-sm border border-border bg-muted px-2 text-[11px] font-semibold uppercase text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t("assistant.newConversation")}
        </button>
      </div>

      <Conversation className="min-h-0 flex-1">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState>
              <img src={analystIcon} alt="" className="h-14 w-14" />
              <div className="text-sm font-semibold">{t("assistant.emptyTitle")}</div>
              <div className="text-xs text-muted-foreground">{t("assistant.emptyText")}</div>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {examples.map((q) => (
                  <button key={q} onClick={() => ask(q)} className="rounded-sm border border-border bg-muted px-2.5 py-1 text-[11px] hover:border-primary">
                    {q}
                  </button>
                ))}
              </div>
            </ConversationEmptyState>
          ) : (
            messages.map((m) => (
              <Message key={m.id} from={m.role}>
                <MessageContent className="group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground">
                  {m.parts.map((part, i) => {
                    if (part.type === "text")
                      return m.role === "user" ? <span key={i}>{part.text}</span> : <MessageResponse key={i}>{part.text}</MessageResponse>;
                    if (part.type.startsWith("tool-") && "state" in part) {
                      const tp = part as Parameters<typeof ToolHeader>[0] & { input: unknown; output?: unknown; errorText?: string };
                      const name = part.type.slice(5);
                      return (
                        <Tool key={i} defaultOpen={false}>
                          <ToolHeader type={tp.type} state={tp.state} title={t(`assistant.tools.${name}`, name)} />
                          <ToolContent>
                            <ToolInput input={tp.input} />
                            <ToolOutput output={tp.output as never} errorText={tp.errorText} />
                          </ToolContent>
                        </Tool>
                      );
                    }
                    return null;
                  })}
                </MessageContent>
              </Message>
            ))
          )}
          {status === "submitted" && <Shimmer className="text-sm">{t("assistant.thinking")}</Shimmer>}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <PromptInput onSubmit={(msg) => ask(msg.text ?? "")}>
        <PromptInputTextarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={t("assistant.placeholder")} />
        <PromptInputFooter className="justify-end">
          <PromptInputSubmit status={status} disabled={!busy && !text.trim()} onStop={stop} />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}

export default function FeedAssistantPage() {
  const { user } = useAuth();
  const [initial, setInitial] = useState<UIMessage[] | null>(null);

  useEffect(() => {
    let alive = true;
    setInitial(null);
    supabase
      .from("ai_chat_messages")
      .select("message_id,role,parts")
      .order("created_at")
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) toast.error(error.message);
        setInitial((data ?? []).map((r) => ({ id: r.message_id, role: r.role as UIMessage["role"], parts: r.parts as UIMessage["parts"] })));
      });
    return () => {
      alive = false;
    };
  }, [user?.id]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MonitorSubBar tabs={[]} activeTab={null} onActivate={() => {}} onClose={() => {}} onAdd={() => {}} hideTabs />
      {initial ? <ChatWindow key={user?.id} initial={initial} /> : <div className="p-6 text-xs text-muted-foreground">…</div>}
    </div>
  );
}
