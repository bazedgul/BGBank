import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Account = {
  id: string;
  accountNumberMasked: string;
  currency: string;
  availableBalanceMinor: string;
};
type Transaction = {
  id: string;
  side: string;
  amountMinor: string;
  currency: string;
  postedAt: string;
  businessReference: string;
};
type ApiResult = {
  data?: unknown;
  error?: { message?: string; code?: string };
};

async function api(path: string, init: RequestInit = {}): Promise<ApiResult> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = (await response.json().catch(() => ({}))) as ApiResult;
  if (!response.ok) throw new Error(body.error?.message ?? "Request failed.");
  return body;
}

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [message, setMessage] = useState("");
  const [csrf, setCsrf] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const loadAccounts = async () => {
    const result = await api("/me/accounts");
    setAccounts((result.data ?? []) as Account[]);
    setAuthenticated(true);
  };
  useEffect(() => {
    void loadAccounts().catch(() => setAuthenticated(false));
  }, []);

  if (!authenticated)
    return (
      <main>
        <h1>BG Bank</h1>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setMessage("");
            try {
              const result = await api("/auth/session", {
                method: "POST",
                body: JSON.stringify({ identifier, password }),
              });
              setCsrf((result.data as { csrfToken: string }).csrfToken);
              setPassword("");
              await loadAccounts();
            } catch (error) {
              setMessage(
                error instanceof Error ? error.message : "Unable to sign in.",
              );
            }
          }}
        >
          <label>
            Email
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button>Sign in</button>
        </form>
        <p role="alert">{message}</p>
      </main>
    );

  return (
    <main>
      <header>
        <h1>BG Bank</h1>
        <button
          onClick={async () => {
            await api("/auth/session", {
              method: "DELETE",
              headers: { Origin: window.location.origin, "X-CSRF-Token": csrf },
            });
            setAuthenticated(false);
          }}
        >
          Logout
        </button>
        <button
          onClick={async () => {
            await api("/auth/sessions/revoke-all", {
              method: "POST",
              headers: { Origin: window.location.origin, "X-CSRF-Token": csrf },
            });
            setAuthenticated(false);
          }}
        >
          Logout all
        </button>
      </header>
      <section>
        <h2>Accounts</h2>
        {accounts.map((account) => (
          <article key={account.id}>
            <button
              onClick={async () => {
                setSelectedAccount(account);
                const result = await api(
                  `/me/accounts/${account.id}/transactions`,
                );
                setTransactions((result.data ?? []) as Transaction[]);
              }}
            >
              <strong>•••• {account.accountNumberMasked}</strong>
              <span>
                {account.availableBalanceMinor} {account.currency}
              </span>
            </button>
          </article>
        ))}
      </section>
      {selectedAccount && (
        <section>
          <h2>Transactions</h2>
          {transactions.length === 0 ? (
            <p>No posted transactions.</p>
          ) : (
            transactions.map((transaction) => (
              <article key={transaction.id}>
                <span>
                  {transaction.side} {transaction.amountMinor}{" "}
                  {transaction.currency}
                </span>
                <time>{new Date(transaction.postedAt).toLocaleString()}</time>
              </article>
            ))
          )}
        </section>
      )}
      <Transfer csrf={csrf} onComplete={() => void loadAccounts()} />
      <p role="alert">{message}</p>
    </main>
  );
}

function Transfer({
  csrf,
  onComplete,
}: {
  csrf: string;
  onComplete: () => void;
}) {
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [message, setMessage] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  return (
    <section>
      <h2>Internal transfer</h2>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setMessage("");
          try {
            await api("/transfers", {
              method: "POST",
              headers: {
                Origin: window.location.origin,
                "X-CSRF-Token": csrf,
                "Idempotency-Key": idempotencyKey,
              },
              body: JSON.stringify({
                sourceAccountId: source,
                destinationAccountId: destination,
                amountMinor: amount,
                currency,
              }),
            });
            setMessage("Transfer completed.");
            setIdempotencyKey(crypto.randomUUID());
            onComplete();
          } catch (error) {
            setMessage(
              error instanceof Error
                ? error.message
                : "Transfer failed. Retry with the same request if necessary.",
            );
          }
        }}
      >
        <input
          aria-label="Source account"
          placeholder="Source account ID"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          required
        />
        <input
          aria-label="Destination account"
          placeholder="Destination account ID"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          required
        />
        <input
          aria-label="Amount"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
        <input
          aria-label="Currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          maxLength={3}
          required
        />
        <button>Transfer</button>
      </form>
      <p role="status">{message}</p>
    </section>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
