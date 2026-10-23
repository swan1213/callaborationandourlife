import Icon from './Icons.jsx';

// Shown until the assistant is opened from TailorBid. It works only with a TailorBid account (admins, users and
// callers): the connection made by TailorBid's Interview Assistant button is what gives it access to OpenAI.
export default function ConnectScreen({ site, expired, error }) {
  return (
    <div className="connect-screen">
      <div className="card connect-card">
        <span className="brand-mark connect-mark">
          <Icon name="logo" />
        </span>
        <h1>{expired ? 'Your TailorBid connection has ended' : 'Open the assistant from TailorBid'}</h1>
        <p>
          The Interview Assistant works with your TailorBid account (admins, users and callers). In TailorBid, open an
          interview and click <b>Interview Assistant</b>, then <b>Open assistant</b>.
          {expired && ' A connection lasts 12 hours.'}
        </p>
        {error && <div className="callout callout-danger">{error}</div>}
        {site && (
          <button type="button" className="primary" onClick={() => window.open(site, '_blank', 'noopener')}>
            Open TailorBid
          </button>
        )}
      </div>
    </div>
  );
}
