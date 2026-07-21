import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hash, Users, Dice5, ArrowRight, MessageSquareText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getNickname, setNickname, getDeviceId } from '@/lib/identity';
import { toast } from 'sonner';

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1644088379091-d574269d422f?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MDZ8MHwxfHNlYXJjaHwxfHxhYnN0cmFjdCUyMGRpZ2l0YWwlMjBjb25uZWN0aW9ufGVufDB8fHx8MTc4NDY0MzU3OHww&ixlib=rb-4.1.0&q=85';

const FEATURES = [
  {
    icon: Hash,
    title: 'section-rooms',
    subtitle: 'A → R',
    desc: '18 dedicated channels, one per CS section. Drop in, ask a doubt, share notes.',
  },
  {
    icon: MessageSquareText,
    title: 'general',
    subtitle: 'department-wide',
    desc: 'Everyone from the department. Announcements, memes, late-night existentialism.',
  },
  {
    icon: Dice5,
    title: 'random-stranger',
    subtitle: 'omegle-style',
    desc: 'One-to-one chat with a random peer. Skip anytime. Ephemeral by design.',
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const [nick, setNick] = useState('');

  useEffect(() => {
    // Seed device id early
    getDeviceId();
    const existing = getNickname();
    if (existing) setNick(existing);
  }, []);

  const submit = (e) => {
    e.preventDefault();
    const cleaned = nick.trim().replace(/\s+/g, ' ').slice(0, 24);
    if (cleaned.length < 2) {
      toast.error('Nickname must be at least 2 characters');
      return;
    }
    setNickname(cleaned);
    navigate('/chat');
  };

  return (
    <div className="min-h-screen w-full bg-[#1e1f22] text-[#f2f3f5] relative overflow-hidden">
      {/* Hero background */}
      <div className="absolute inset-0">
        <img
          src={HERO_IMAGE}
          alt=""
          className="w-full h-full object-cover opacity-25"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#1e1f22]/70 via-[#1e1f22]/85 to-[#1e1f22]" />
        <div className="noise-overlay" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-10 md:py-16">
        {/* Top nav */}
        <div className="flex items-center justify-between mb-16">
          <div className="flex items-center gap-2" data-testid="app-logo">
            <div className="w-8 h-8 rounded-md bg-[#5865f2] flex items-center justify-center">
              <Hash className="w-5 h-5 text-white" />
            </div>
            <span className="font-mono-ui font-extrabold tracking-tight text-lg">
              cs<span className="text-[#23a559]">.</span>chatroom
            </span>
          </div>
          <div className="hidden md:flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[#949ba4]">
            <span className="w-2 h-2 rounded-full bg-[#23a559] pulse-dot" />
            <span>live · v1</span>
          </div>
        </div>

        {/* Hero */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-7">
            <p className="font-mono-ui text-xs uppercase tracking-[0.3em] text-[#23a559] mb-4">
              // for the cs department
            </p>
            <h1
              className="font-mono-ui text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tighter leading-[0.95]"
              data-testid="hero-title"
            >
              a chatroom<br />
              <span className="text-[#949ba4]">between</span> classes.<br />
              <span className="text-[#23a559]">no</span> accounts. no fuss.
            </h1>
            <p className="mt-6 text-[#b5bac1] text-base md:text-lg leading-relaxed max-w-xl">
              Pick a nickname, drop into your section&apos;s channel, DM a random stranger, or lurk in{' '}
              <span className="font-mono-ui text-[#f2f3f5]">#general</span>. Nothing is tied to you.
              Everything stays fast.
            </p>

            <form onSubmit={submit} className="mt-10 max-w-md">
              <label
                htmlFor="nick-input"
                className="block font-mono-ui text-[11px] uppercase tracking-[0.25em] text-[#949ba4] mb-2"
              >
                choose your handle
              </label>
              <div className="flex items-stretch gap-2 bg-[#2b2d31] border border-[#1e1f22] rounded-lg p-1 focus-within:ring-2 focus-within:ring-[#5865f2]/60">
                <div className="flex items-center pl-3 pr-1 text-[#949ba4] font-mono-ui">@</div>
                <Input
                  id="nick-input"
                  data-testid="nickname-input"
                  value={nick}
                  onChange={(e) => setNick(e.target.value)}
                  placeholder="cs-ghost-42"
                  maxLength={24}
                  className="flex-1 bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-[#f2f3f5] placeholder:text-[#5c6069] font-mono-ui text-base"
                />
                <Button
                  type="submit"
                  data-testid="enter-chatroom-btn"
                  className="bg-[#5865f2] hover:bg-[#4752c4] text-white font-medium rounded-md px-4 gap-2 transition-colors"
                >
                  enter <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
              <p className="mt-3 text-xs text-[#5c6069] font-mono-ui">
                stored locally in your browser · change anytime by clearing site data
              </p>
            </form>
          </div>

          {/* Right side stat card */}
          <div className="lg:col-span-5">
            <div className="rounded-2xl border border-[#1e1f22] bg-[#2b2d31]/80 backdrop-blur-sm p-6 md:p-8">
              <div className="flex items-center justify-between">
                <span className="font-mono-ui text-[11px] uppercase tracking-[0.25em] text-[#949ba4]">
                  channels open
                </span>
                <span className="w-2 h-2 rounded-full bg-[#23a559] pulse-dot" />
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-mono-ui text-6xl font-extrabold tracking-tighter">19</span>
                <span className="text-[#949ba4] text-sm">rooms live</span>
              </div>
              <div className="mt-6 grid grid-cols-6 gap-1.5">
                {['GEN', ...'ABCDEFGHIJKLMNOPQR'.split('')].map((l) => (
                  <div
                    key={l}
                    className="aspect-square rounded-md bg-[#313338] border border-[#1e1f22] flex items-center justify-center font-mono-ui text-[10px] font-bold text-[#949ba4] hover:text-[#23a559] hover:border-[#23a559]/40 transition-colors"
                  >
                    {l}
                  </div>
                ))}
              </div>
              <div className="mt-6 flex items-center gap-3 pt-6 border-t border-[#1e1f22]">
                <Users className="w-4 h-4 text-[#23a559]" />
                <span className="text-sm text-[#b5bac1]">
                  Presence shown live · unread badges auto-track per device.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Feature cards */}
        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-4">
          {FEATURES.map(({ icon: Icon, title, subtitle, desc }, i) => (
            <div
              key={title}
              data-testid={`feature-card-${title}`}
              className="group relative rounded-xl border border-[#1e1f22] bg-[#2b2d31]/70 p-6 hover:border-[#5865f2]/40 hover:bg-[#2b2d31] transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="w-11 h-11 rounded-lg bg-[#1e1f22] flex items-center justify-center group-hover:bg-[#5865f2]/20 transition-colors">
                  <Icon className="w-5 h-5 text-[#f2f3f5] group-hover:text-[#5865f2] transition-colors" />
                </div>
                <span className="font-mono-ui text-[10px] uppercase tracking-[0.25em] text-[#5c6069]">
                  0{i + 1}
                </span>
              </div>
              <h3 className="mt-6 font-mono-ui text-xl font-extrabold tracking-tight text-[#f2f3f5]">
                #{title}
              </h3>
              <p className="mt-1 font-mono-ui text-[11px] uppercase tracking-[0.2em] text-[#23a559]">
                {subtitle}
              </p>
              <p className="mt-4 text-sm text-[#b5bac1] leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-20 pt-8 border-t border-[#1e1f22] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <p className="font-mono-ui text-xs text-[#5c6069]">
            &copy; cs.chatroom · no accounts · no tracking · just chat
          </p>
          <p className="font-mono-ui text-xs text-[#5c6069]">
            built for students, between classes.
          </p>
        </div>
      </div>
    </div>
  );
}
