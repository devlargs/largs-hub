import { useId, useState } from "react";
import { MdOutlineVisibility, MdOutlineVisibilityOff } from "react-icons/md";

// A password field with a show/hide toggle (issue #108). Typing a password you
// can't see is guesswork — worse for a master password, where a typo locks the
// workspace behind something you never meant to set.
//
// Every input prop is passed straight through so each caller keeps its own
// padding, radius and colours; only the right-hand padding is reserved here, so
// the text never runs under the eye.

const TOGGLE_WIDTH = 34;

interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  inputRef?: React.Ref<HTMLInputElement>;
  // Class on the wrapper, so a caller laying the field out ("w-full") still can
  className?: string;
  wrapperClassName?: string;
}

export default function PasswordInput({
  inputRef,
  className,
  wrapperClassName = "w-full",
  style,
  disabled,
  ...inputProps
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const fallbackId = useId();
  const inputId = inputProps.id ?? fallbackId;

  return (
    <div className={`relative ${wrapperClassName}`}>
      <input
        {...inputProps}
        id={inputId}
        ref={inputRef}
        type={visible ? "text" : "password"}
        disabled={disabled}
        className={className}
        style={{ ...style, paddingRight: TOGGLE_WIDTH }}
      />
      <button
        type="button"
        // The eye is a convenience, not a step in the form: Tab goes from the
        // field to the next one, and the toggle is still reachable by click or
        // by the screen reader's own controls.
        tabIndex={-1}
        aria-controls={inputId}
        aria-pressed={visible}
        aria-label={visible ? "Hide password" : "Show password"}
        title={visible ? "Hide password" : "Show password"}
        disabled={disabled}
        onClick={() => setVisible((shown) => !shown)}
        className="absolute flex items-center justify-center hover:brightness-150"
        style={{
          top: 0,
          bottom: 0,
          right: 0,
          width: TOGGLE_WIDTH,
          background: "transparent",
          border: "none",
          color: "var(--text-muted)",
          cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {visible ? <MdOutlineVisibilityOff size={17} /> : <MdOutlineVisibility size={17} />}
      </button>
    </div>
  );
}
