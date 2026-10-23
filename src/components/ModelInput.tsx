"use client";

import { useEffect, useId, useState } from "react";

let cache: Promise<string[]> | null = null;
function loadModels() {
  cache ??= fetch("/api/admin/models")
    .then((r) => r.json())
    .then((d) => (Array.isArray(d.models) ? d.models : []))
    .catch(() => []);
  return cache;
}

/** Text input with suggestions from the models the OpenAI account can use. Free text is allowed. */
export default function ModelInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const id = useId();
  const [models, setModels] = useState<string[]>([]);
  useEffect(() => {
    loadModels().then(setModels);
  }, []);
  return (
    <>
      <input className="input font-mono text-[13px]" spellCheck={false} list={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      <datalist id={id}>
        {models.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
    </>
  );
}
