"use client";

import {
  deriveAuthPrompts,
  deriveSteps,
  findErrorMessage,
  findResultMessage,
  type AuthPrompt,
  type Step,
  type StreamMessage,
} from "@/lib/steps";
import { parseEvaluation, type Evaluation } from "@/lib/evaluation";
import { renderInline } from "@/lib/render";

type Props = {
  messages: StreamMessage[];
  running: boolean;
  prompt: string;
  onCancel: () => void;
  onReset: () => void;
};

export function StepsTimeline({
  messages,
  running,
  prompt,
  onCancel,
  onReset,
}: Props) {
  const steps = deriveSteps(messages, running);
  const authPrompts = deriveAuthPrompts(messages);
  const result = findResultMessage(messages);
  const error = findErrorMessage(messages);
  const { evaluation, cleanedText } = parseEvaluation(result?.result);
  const evaluationFailed = !!evaluation && !evaluation.success;

  return (
    <div className="flex flex-col gap-4">
      <header className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
              Prompt
            </div>
            <div className="text-sm text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap break-words">
              {prompt}
            </div>
          </div>
          <RunStatusPill
            running={running}
            hasError={!!error || !!result?.is_error || evaluationFailed}
          />
        </div>
        <div className="flex gap-2">
          {running ? (
            <button
              onClick={onCancel}
              className="rounded-full border border-zinc-300 dark:border-zinc-700 px-4 h-9 text-sm font-medium text-zinc-900 dark:text-zinc-100"
            >
              Cancel
            </button>
          ) : (
            <button
              onClick={onReset}
              className="rounded-full bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 px-4 h-9 text-sm font-medium"
            >
              New run
            </button>
          )}
          <span className="text-xs text-zinc-500 self-center">
            {steps.length} {steps.length === 1 ? "step" : "steps"}
          </span>
        </div>
      </header>

      {authPrompts.length > 0 && (
        <div className="flex flex-col gap-2">
          {authPrompts.map((p, i) => (
            <AuthPromptCard key={p.elicitationId ?? i} prompt={p} />
          ))}
        </div>
      )}

      {steps.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800 p-6 text-sm text-zinc-500 text-center">
          {running ? "Waiting for the agent to take its first action…" : "No tool calls were made."}
        </div>
      ) : (
        <ol className="flex flex-col">
          {steps.map((step, i) => (
            <StepRow
              key={step.id}
              step={step}
              isLast={i === steps.length - 1}
            />
          ))}
        </ol>
      )}

      {result && (
        <ResultFooter
          result={result}
          cleanedText={cleanedText}
          evaluation={evaluation}
        />
      )}
      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950 p-3 text-sm text-red-900 dark:text-red-200">
          {error.error}
        </div>
      )}
    </div>
  );
}

function RunStatusPill({
  running,
  hasError,
}: {
  running: boolean;
  hasError: boolean;
}) {
  if (running) {
    return (
      <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 h-6 text-xs text-zinc-700 dark:text-zinc-300">
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-pulse" />
        Running
      </span>
    );
  }
  if (hasError) {
    return (
      <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-red-100 dark:bg-red-950 px-2.5 h-6 text-xs text-red-800 dark:text-red-300">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        Failed
      </span>
    );
  }
  return (
    <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950 px-2.5 h-6 text-xs text-emerald-800 dark:text-emerald-300">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      Done
    </span>
  );
}

function StepRow({ step, isLast }: { step: Step; isLast: boolean }) {
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center pt-3">
        <StepIcon status={step.status} />
        {!isLast && (
          <div className="flex-1 w-px bg-zinc-200 dark:bg-zinc-800 min-h-4" />
        )}
      </div>
      <details className="flex-1 group rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 mb-2 open:bg-zinc-50 dark:open:bg-zinc-950">
        <summary className="cursor-pointer list-none p-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-mono font-semibold text-zinc-900 dark:text-zinc-100">
              {step.name}
            </div>
            {step.summary && (
              <div className="text-xs text-zinc-500 truncate">{step.summary}</div>
            )}
          </div>
          <StepStatusLabel status={step.status} />
          <span className="text-zinc-400 group-open:rotate-90 transition-transform text-xs">
            ▶
          </span>
        </summary>
        <div className="px-3 pb-3 flex flex-col gap-3 border-t border-zinc-200 dark:border-zinc-800 pt-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
              Input
            </div>
            <pre className="overflow-x-auto text-[11px] text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">
              {JSON.stringify(step.input, null, 2)}
            </pre>
          </div>
          {step.result && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                {step.result.isError ? "Error" : "Output"}
                <span className="ml-2 normal-case tracking-normal text-zinc-400">
                  {step.result.text.length} chars
                </span>
              </div>
              <pre
                className={`overflow-x-auto text-[11px] whitespace-pre-wrap ${
                  step.result.isError
                    ? "text-red-700 dark:text-red-300"
                    : "text-zinc-600 dark:text-zinc-400"
                }`}
              >
                {step.result.text}
              </pre>
            </div>
          )}
        </div>
      </details>
    </li>
  );
}

function StepIcon({ status }: { status: Step["status"] }) {
  if (status === "running") {
    return (
      <span className="w-3 h-3 rounded-full border-2 border-zinc-400 dark:border-zinc-500 animate-pulse" />
    );
  }
  if (status === "failed") {
    return <span className="w-3 h-3 rounded-full bg-red-500" />;
  }
  return <span className="w-3 h-3 rounded-full bg-emerald-500" />;
}

function StepStatusLabel({ status }: { status: Step["status"] }) {
  if (status === "running") {
    return <span className="text-xs text-zinc-500">running…</span>;
  }
  if (status === "failed") {
    return <span className="text-xs text-red-600 dark:text-red-400">failed</span>;
  }
  return <span className="text-xs text-emerald-600 dark:text-emerald-400">done</span>;
}

function ResultFooter({
  result,
  cleanedText,
  evaluation,
}: {
  result: { result?: string; is_error?: boolean; total_cost_usd?: number; duration_ms?: number; num_turns?: number };
  cleanedText: string;
  evaluation: Evaluation | null;
}) {
  const failed = result.is_error || (evaluation ? !evaluation.success : false);
  const text = cleanedText || result.result || "";
  return (
    <div className="flex flex-col gap-3">
      <div
        className={`rounded-lg border p-3 ${
          failed
            ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950"
            : "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950"
        }`}
      >
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
          Result
        </div>
        {text && (
          <div className="text-sm text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap">
            {renderInline(text)}
          </div>
        )}
        <div className="mt-2 text-xs text-zinc-500">
          {result.num_turns != null && <>{result.num_turns} turns · </>}
          {result.duration_ms != null && <>{(result.duration_ms / 1000).toFixed(1)}s · </>}
          {result.total_cost_usd != null && <>${result.total_cost_usd.toFixed(4)}</>}
        </div>
      </div>
      {evaluation && <EvaluationCard evaluation={evaluation} />}
    </div>
  );
}

function EvaluationCard({ evaluation }: { evaluation: Evaluation }) {
  const passed = evaluation.success;
  return (
    <div
      className={`rounded-lg border p-3 ${
        passed
          ? "border-emerald-300 bg-white dark:border-emerald-900 dark:bg-zinc-900"
          : "border-red-300 bg-white dark:border-red-900 dark:bg-zinc-900"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">
          Evaluation
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 h-5 text-[11px] ${
            passed
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              passed ? "bg-emerald-500" : "bg-red-500"
            }`}
          />
          {passed ? "Passed" : "Failed"}
        </span>
      </div>
      <div className="text-sm text-zinc-900 dark:text-zinc-100 mb-3">
        {evaluation.summary}
      </div>
      {evaluation.criteria.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {evaluation.criteria.map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-xs">
              <span
                className={`mt-0.5 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[10px] font-bold ${
                  c.passed
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                    : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                }`}
                aria-hidden
              >
                {c.passed ? "✓" : "✕"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-zinc-900 dark:text-zinc-100">{c.name}</div>
                {c.note && (
                  <div className="text-zinc-500 dark:text-zinc-400">{c.note}</div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AuthPromptCard({ prompt }: { prompt: AuthPrompt }) {
  return (
    <div
      className={`rounded-lg border p-3 flex items-start gap-3 ${
        prompt.resolved
          ? "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950"
          : "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950"
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
          {prompt.resolved ? "Authorized" : "Authorization required"}
        </div>
        <div className="text-sm text-zinc-900 dark:text-zinc-100">
          <span className="font-mono">{prompt.serverName}</span>
          {prompt.message ? ` — ${prompt.message}` : ""}
        </div>
      </div>
      {!prompt.resolved && (
        <a
          href={prompt.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 px-4 h-8 inline-flex items-center text-xs font-medium whitespace-nowrap"
        >
          Authorize ↗
        </a>
      )}
    </div>
  );
}
