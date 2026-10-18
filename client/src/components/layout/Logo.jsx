export default function Logo({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="CWW">
      <rect width="64" height="64" rx="18" fill="#17383d" />
      <path d="M14 18a6 6 0 0 1 6-6h20a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6H29l-9 8v-8a6 6 0 0 1-6-6z" fill="#e4572e" />
      <path d="M26 30a6 6 0 0 1 6-6h14a6 6 0 0 1 6 6v12a6 6 0 0 1-6 6v6l-8-6H32a6 6 0 0 1-6-6z" fill="#f4eee3" />
    </svg>
  );
}
