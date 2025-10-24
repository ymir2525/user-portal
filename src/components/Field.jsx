import React, { useRef, useState } from "react";

function useNonce() {
  const r = useRef(Math.random().toString(36).slice(2));
  return r.current;
}

export default function Field({
  label,
  value,
  setValue,
  type = "text",
  required = false,
  maxLength,
  autoComplete = "off",
  name,
  inputMode,
  preventAutofill = false,
  className = "",
}) {
  const nonce = useNonce();
  const [ro, setRo] = useState(preventAutofill);

  const computedName = preventAutofill
    ? `${(name || label || "field").toLowerCase().replace(/\s+/g, "-")}-${nonce}`
    : name;
  const computedAC = preventAutofill ? "off" : autoComplete;

  return (
    <div className={className}>
      <label className="block mb-1 text-sm">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        className="w-full px-3 py-2 border rounded-lg"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        required={required}
        maxLength={maxLength}
        autoComplete={computedAC}
        name={computedName}
        inputMode={inputMode}
        autoCapitalize="off"
        spellCheck={false}
        readOnly={ro}
        onFocus={() => preventAutofill && setRo(false)}
      />
    </div>
  );
}
