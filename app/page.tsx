'use client'

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { ArrowLeft, ArrowUpRight, CheckCheck, Code, Copy, Heart, Image as ImageIcon, Link, Link2, LoaderCircle, LockKeyhole, Menu, MessageCircle, Paperclip, Plus, QrCode, Reply, Save, Send, Smile, UserRound, Users, X, Zap } from 'lucide-react'

type Message = {
  id: string
  from: string
  senderId?: string
  text?: string
  time: string
  mine?: boolean
  color?: string
  createdAt?: string
  attachment?: { name: string; type: string; dataUrl: string }
}

const colors = ['peach', 'lavender', 'mint', 'blue']
const emojiOptions = ['😀', '😂', '😍', '👍', '👏', '🎉', '❤️', '🔥', '🙏', '😅', '🤝', '✨']
const faces = ['#f4c7ab', '#d9b18f', '#ead0bd', '#c99578']

function Avatar({ index = 0, small = false }: { index?: number; small?: boolean }) {
  return <div className={`avatar ${small ? 'avatar-small' : ''}`} style={{ background: faces[index % faces.length] }}><UserRound aria-hidden="true" /></div>
}

function Loading({ label }: { label: string }) {
  return <div className="loading-state" role="status"><LoaderCircle className="spin" /> <span>{label}</span></div>
}

export default function Page() {
  const [screen, setScreen] = useState<'home' | 'chat'>('home')
  const [modal, setModal] = useState<'create' | 'join' | 'share' | 'leave' | 'close' | 'qr' | 'developer' | 'developer-password' | 'developer-manage' | null>(null)
  const [isCreator, setIsCreator] = useState(false)
  const [memberCount, setMemberCount] = useState(1)
  const [members, setMembers] = useState<Array<{ clientId: string; name: string }>>([])
  const [loading, setLoading] = useState(false)
  const [roomName, setRoomName] = useState('Late night thoughts')
  const [limit, setLimit] = useState('4')
  const [joinCode, setJoinCode] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [showMembers, setShowMembers] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [pendingMedia, setPendingMedia] = useState<{ name: string; type: string; dataUrl: string } | null>(null)
  const [qr, setQr] = useState('')
  const [viewingImage, setViewingImage] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [typingCount, setTypingCount] = useState(0)
  const [developerInfo, setDeveloperInfo] = useState({
    instagram: process.env.NEXT_PUBLIC_INSTAGRAM_URL || 'https://instagram.com',
    linkedin: process.env.NEXT_PUBLIC_LINKEDIN_URL || 'https://linkedin.com',
    github: process.env.NEXT_PUBLIC_GITHUB_URL || 'https://github.com',
  })
  const [developerPassword, setDeveloperPassword] = useState('')
  const [developerSessionPassword, setDeveloperSessionPassword] = useState('')
  const [developerError, setDeveloperError] = useState('')
  const [savingDeveloperInfo, setSavingDeveloperInfo] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const lastCreated = useRef(0)
  const clientId = useMemo(() => {
    if (typeof window === 'undefined') return ''
    const key = 'quiet-chat-client-id'
    const existing = window.sessionStorage.getItem(key)
    if (existing) return existing
    const created = crypto.randomUUID()
    window.sessionStorage.setItem(key, created)
    return created
  }, [])
  const shareLink = typeof window === 'undefined' ? '' : `${window.location.origin}/?room=${roomCode}`

  useEffect(() => {
    if (messages.length) bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('room')
    if (code) void enterRoom(code)
  }, [])

  useEffect(() => {
    if (screen !== 'chat' || !roomCode || !clientId) return
    const poll = async () => {
      const response = await fetch(`/api/rooms/messages?code=${roomCode}&after=${lastCreated.current}&clientId=${clientId}`, { cache: 'no-store' })
      if (response.status === 410) { leave(); return }
      if (!response.ok) return
      const payload = await response.json() as { messages: Message[]; members?: number; typingUsers?: number; participants?: Array<{ clientId: string; name: string }> }
      setMemberCount(payload.members || 1)
      setTypingCount(payload.typingUsers || 0)
      if (payload.participants) setMembers(payload.participants)
      const incoming = payload.messages || []
      if (!incoming.length) return
      lastCreated.current = Math.max(...incoming.map((item) => new Date(item.createdAt || 0).getTime()))
      setMessages((current) => {
        const next = incoming.filter((item) => !current.some((existing) => existing.id === item.id)).map(formatMessage)
        return [...current, ...next]
      })
    }
    void poll()
    const timer = window.setInterval(poll, 1600)
    return () => window.clearInterval(timer)
  }, [screen, roomCode, clientId])

  useEffect(() => {
    if (screen !== 'chat' || !roomCode || !clientId || !draft) return
    const sendTypingStatus = async () => {
      await fetch('/api/rooms/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode, senderId: clientId, typing: true })
      }).catch(() => {})
    }
    void sendTypingStatus()
    const timer = window.setInterval(sendTypingStatus, 2000)
    return () => window.clearInterval(timer)
  }, [screen, roomCode, clientId, draft])

  useEffect(() => {
    if (screen !== 'chat' || !roomCode || !clientId || draft) return
    const sendTypingStopped = async () => {
      await fetch('/api/rooms/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode, senderId: clientId, typing: false })
      }).catch(() => {})
    }
    void sendTypingStopped()
  }, [screen, roomCode, clientId, draft])

  useEffect(() => {
    if (modal !== 'developer') return
    const fetchDeveloperInfo = async () => {
      try {
        const response = await fetch('/api/developer', { cache: 'no-store' })
        if (response.ok) {
          const data = await response.json()
          setDeveloperInfo((current) => ({
            instagram: data.instagram || current.instagram,
            linkedin: data.linkedin || current.linkedin,
            github: data.github || current.github,
          }))
        }
      } catch (error) {
        console.error('[v0] Failed to fetch developer info:', error)
      }
    }
    void fetchDeveloperInfo()
  }, [modal])

  const formatMessage = (item: Message): Message => ({ ...item, time: item.time || new Date(item.createdAt || '').toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) })

  const enterRoom = async (code: string) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/rooms?code=${encodeURIComponent(code)}&clientId=${clientId}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('That room does not exist or has expired.')
      const data = await response.json()
      setRoomCode(code.toUpperCase())
      setRoomName(data.room.name)
      setIsCreator(data.room.creatorId === clientId)
      setMemberCount(Number(data.room.members) || 1)
      const initial = data.messages.map(formatMessage)
      setMessages(initial)
      lastCreated.current = Math.max(0, ...initial.map((item: Message) => new Date(item.createdAt || 0).getTime()))
      setScreen('chat')
      setModal(null)
    } catch (error) { window.alert(error instanceof Error ? error.message : 'Unable to join this room.') } finally { setLoading(false) }
  }

  const createRoom = async () => {
    setLoading(true)
  try {
  const response = await fetch('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: roomName, limit, clientId }) })
  const data = await response.json().catch(() => ({ error: 'Unable to create room. Please try again.' }))
  if (!response.ok || !data.roomCode) throw new Error(data.error || 'Unable to create room. Please try again.')
  setRoomCode(data.roomCode)
      setIsCreator(true)
      setMemberCount(1)
      setMessages([])
      setScreen('chat')
  setModal('share')
  } catch (error) {
  window.alert(error instanceof Error ? error.message : 'Unable to create room. Please try again.')
  } finally { setLoading(false) }
  }

  useEffect(() => {
    if (screen !== 'chat' || !roomCode || !clientId) return
    const timer = window.setTimeout(() => {
      void fetch('/api/rooms/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomCode, senderId: clientId, typing: Boolean(draft.trim()) }) })
    }, 250)
    return () => window.clearTimeout(timer)
  }, [draft, screen, roomCode, clientId])

  const sendMessage = async () => {
    const text = draft.trim()
    if (sending || (!text && !pendingMedia) || !roomCode || !clientId) return
    setSending(true)
    const response = await fetch('/api/rooms/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomCode, text, senderId: clientId, from: 'Guest', attachment: pendingMedia }),
    })
    if (response.ok) { setDraft(''); setPendingMedia(null); setReplyingTo(null); setShowEmoji(false) }
    setSending(false)
  }

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { window.alert('Please choose an image file.'); return }
    if (file.size > 4 * 1024 * 1024) { window.alert('Please choose an image smaller than 4 MB.'); return }
    const reader = new FileReader()
    reader.onload = () => setPendingMedia({ name: file.name, type: file.type, dataUrl: String(reader.result) })
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const closeRoom = async () => {
    if (!roomCode || !clientId) return
    setLoading(true)
    try {
      const response = await fetch('/api/rooms', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomCode, clientId }) })
      if (!response.ok) throw new Error('Only the room creator can close this room.')
      leave()
    } catch (error) { window.alert(error instanceof Error ? error.message : 'Unable to close this room.') } finally { setLoading(false) }
  }
  const showQr = async () => { setQr(await QRCode.toDataURL(shareLink, { width: 240, margin: 2 })); setModal('qr') }
  const openDeveloperManager = async () => {
    setDeveloperError('')
    setSavingDeveloperInfo(true)
    try {
      const response = await fetch('/api/developer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'verify', password: developerPassword }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to verify password.')
      setDeveloperSessionPassword(developerPassword)
      setDeveloperPassword('')
      setModal('developer-manage')
    } catch (error) {
      setDeveloperError(error instanceof Error ? error.message : 'Unable to verify password.')
    } finally { setSavingDeveloperInfo(false) }
  }
  const saveDeveloperInfo = async () => {
    setDeveloperError('')
    setSavingDeveloperInfo(true)
    try {
      const response = await fetch('/api/developer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: developerSessionPassword, ...developerInfo }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to save social links.')
      setModal('developer')
    } catch (error) {
      setDeveloperError(error instanceof Error ? error.message : 'Unable to save social links.')
    } finally { setSavingDeveloperInfo(false) }
  }
  const leave = () => { setScreen('home'); setRoomCode(''); setMessages([]); setModal(null); setPendingMedia(null) }

  if (loading) return <main className="app-shell"><Loading label="Opening your quiet room…" /></main>

  return <main className="app-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    {screen === 'home' ? <section className="home-screen"><header className="brand-row"><div className="brand-mark">q</div><span className="brand-name">quiet<span>.</span>chat</span><button className="icon-button subtle" aria-label="Menu" onClick={() => setModal('developer')}><Menu /></button></header><div className="hero-copy"><div className="eyebrow"><span className="pulse-dot" /> private by default</div><h1>A room for the<br /><em>conversation.</em></h1><p>No accounts. No history. Just a quiet place to talk, together.</p></div><div className="entry-cards"><button className="entry-card create-card" onClick={() => setModal('create')}><span className="card-icon"><Plus /></span><span><strong>Create a chat</strong><small>Start a private room in seconds</small></span><span className="card-arrow"><ArrowUpRight /></span></button><button className="entry-card join-card" onClick={() => setModal('join')}><span className="card-icon"><Link2 /></span><span><strong>Join a chat</strong><small>Enter a code or follow a link</small></span><span className="card-arrow"><ArrowUpRight /></span></button></div><div className="privacy-note"><Zap /> Your room expires after 5 minutes of inactivity</div></section> : <section className="chat-screen">
      <header className="chat-header"><button className="icon-button" onClick={() => setModal('leave')} aria-label="Leave chat"><ArrowLeft /></button><div className="chat-title"><div className="room-avatar"><MessageCircle /></div><div><strong>{roomName}</strong><span><i /> {memberCount} {memberCount === 1 ? 'person' : 'people'} in the chat</span></div></div><div className="header-actions"><button className="icon-button" onClick={() => setModal('share')} aria-label="Share room"><Link2 /></button><button className="icon-button" onClick={() => setShowMembers((value) => !value)} aria-label="View members"><Users /></button>{isCreator && <button className="icon-button close-room-button" onClick={() => setModal('close')} aria-label="Close room"><X /></button>}</div></header>
      {showMembers && <div className="members-popover"><div className="popover-title">In this room <button onClick={() => setShowMembers(false)} aria-label="Close members"><X /></button></div>{members.map((member, index) => <div className="member-row" key={member.clientId}><Avatar small index={index} /> {member.name} <small>online</small></div>)}</div>}
      <div ref={bodyRef} className="chat-body"><div className="room-notice"><MessageCircle /> Room created <CheckCheck /></div><div className="date-chip">Today</div>{messages.map((message, index) => <article className={`message-row ${message.mine ? 'mine' : ''}`} key={message.id}>{!message.mine && <Avatar index={index + 1} />}<div className="message-stack"><div className="message-meta">{message.mine ? 'You' : message.from}</div>{message.attachment && <button className="sent-image-button" onClick={() => setViewingImage(message.attachment!.dataUrl)} aria-label={`Open ${message.attachment.name}`}><img className="sent-image" src={message.attachment.dataUrl} alt={message.attachment.name} /></button>}{message.text && <div className={`message-bubble ${message.color || colors[index % colors.length]}`}>{message.text}</div>}<div className="message-foot"><span>{message.time}</span>{message.mine && <CheckCheck />}<button onClick={() => setReplyingTo(message)} aria-label="Reply"><Reply /></button></div></div></article>)}{!messages.length && <div className="empty-chat"><MessageCircle /><p>Your room is ready.</p><small>Send the first message when you are ready.</small></div>}<div /></div>
      {typingCount > 0 && <div className="typing-row" aria-live="polite"><Avatar small /><div className="typing-bubble"><span /><span /><span /></div><small>{typingCount === 1 ? 'Someone is typing…' : `${typingCount} people are typing…`}</small></div>}
  {replyingTo && <div className="reply-bar"><Reply /><div><small>Replying to {replyingTo.mine ? 'your message' : replyingTo.from}</small><span>{replyingTo.text || replyingTo.attachment?.name}</span></div><button onClick={() => setReplyingTo(null)} aria-label="Cancel reply"><X /></button></div>}
      {pendingMedia && <div className="media-preview"><img src={pendingMedia.dataUrl} alt="Selected image preview" /><div><strong>{pendingMedia.name}</strong><small>Ready to send</small></div><button onClick={() => setPendingMedia(null)} aria-label="Remove selected image"><X /></button></div>}
      <div className="composer-wrap"><div className="composer"><input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) void sendMessage() }} placeholder="Write a message…" aria-label="Message" /><input ref={fileRef} className="sr-only" type="file" accept="image/*" onChange={selectFile} /><button className="composer-icon" onClick={() => fileRef.current?.click()} aria-label="Attach image"><Paperclip /></button><button className={`composer-icon ${showEmoji ? 'active' : ''}`} onClick={() => setShowEmoji((value) => !value)} aria-label="Choose emoji"><Smile /></button><button className="send-button" disabled={sending} onClick={() => void sendMessage()} aria-label="Send message"><Send /></button></div>{showEmoji && <div className="emoji-picker" role="listbox">{emojiOptions.map((emoji) => <button key={emoji} onClick={() => setDraft((value) => `${value}${emoji}`)} aria-label={`Add ${emoji}`}>{emoji}</button>)}</div>}<div className="composer-hint"><span><ImageIcon /> Images up to 4 MB</span><span>Enter to send</span></div></div>
    </section>}
    {viewingImage && <div className="image-lightbox" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewingImage(null) }}><button className="image-lightbox-close" onClick={() => setViewingImage(null)} aria-label="Close image"><X /></button><img src={viewingImage} alt="Full-size attachment" /></div>}
    {modal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null) }}><div className="modal-card">{modal !== 'leave' && <button className="modal-close" onClick={() => setModal(null)} aria-label="Close"><X /></button>}{modal === 'create' && <><div className="modal-icon"><Plus /></div><div className="modal-heading"><h2>Create a quiet room</h2><p>A private space that disappears when the conversation ends.</p></div><label>Room name<input value={roomName} onChange={(event) => setRoomName(event.target.value)} /></label><label>People allowed<select value={limit} onChange={(event) => setLimit(event.target.value)}><option value="2">2 people</option><option value="4">4 people</option><option value="8">8 people</option></select></label><button className="primary-button" onClick={() => void createRoom()}>Create room <ArrowUpRight /></button></>}{modal === 'join' && <><div className="modal-icon blue-icon"><Link2 /></div><div className="modal-heading"><h2>Join a room</h2><p>Enter the invite code shared with you.</p></div><label>Room code<input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="e.g. OR534O" /></label><button className="primary-button" disabled={joinCode.length < 4} onClick={() => void enterRoom(joinCode)}>Join room <ArrowUpRight /></button><div className="or-divider">or</div><button className="secondary-button" onClick={() => window.alert('QR scanning can be added with camera permissions in the deployed app.') }><QrCode /> Scan invite QR</button></>}{modal === 'close' && <><div className="modal-icon red-icon"><X /></div><div className="modal-heading"><h2>Close this room?</h2><p>Everyone in the chat will be sent back to the home screen immediately.</p></div><div className="leave-actions"><button className="secondary-button" onClick={() => setModal(null)}>Keep room open</button><button className="primary-button danger-button" onClick={() => void closeRoom()}>Close room</button></div></>}{modal === 'share' && <><div className="modal-icon green-icon"><Link2 /></div><div className="modal-heading"><h2>Invite people in</h2><p>Share this room code or scan the QR.</p></div><div className="room-code"><small>ROOM CODE</small><strong>{roomCode}</strong><button onClick={() => void navigator.clipboard?.writeText(roomCode)} aria-label="Copy room code"><Copy /></button></div><button className="share-link" onClick={() => void navigator.clipboard?.writeText(shareLink)} aria-label="Copy invite link"><Link2 /> Copy link</button><button className="secondary-button" onClick={() => void showQr()}><QrCode /> Show invite QR</button><button className="primary-button" onClick={() => setModal(null)}>Done</button></>}{modal === 'qr' && <><div className="modal-icon green-icon"><QrCode /></div><div className="modal-heading"><h2>Scan to join</h2><p>Point your camera at this room invite.</p></div>{qr && <img className="qr-image" src={qr} alt="QR code for this room" />}<button className="primary-button" onClick={() => setModal('share')}>Done</button></>}{modal === 'developer' && <><div className="modal-heading developer-heading"><h2>Developed by <span className="developer-name">White</span></h2><button type="button" className="developer-manage-button" onClick={() => { setDeveloperError(''); setDeveloperPassword(''); setModal('developer-password') }} aria-label="Manage social links"><LockKeyhole /></button></div><div className="developer-socials"><a href={developerInfo.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="social-link instagram"><img src="https://cdn.jsdelivr.net/gh/glincker/thesvgmain/public/icons/instagram/default.svg" alt="Instagram" /></a><a href={developerInfo.linkedin} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="social-link linkedin"><img src="https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/linkedin/default.svg" alt="LinkedIn" /></a><a href={developerInfo.github} target="_blank" rel="noopener noreferrer" aria-label="GitHub" className="social-link github"><img src="https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/github/default.svg" alt="GitHub" /></a></div></>}{modal === 'developer-password' && <><div className="modal-icon"><LockKeyhole /></div><div className="modal-heading"><h2>Manage social links</h2><p>Enter the developer password to update these links.</p></div><label>Developer password<input type="password" value={developerPassword} onChange={(event) => setDeveloperPassword(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void openDeveloperManager() }} autoFocus /></label>{developerError && <p className="form-error" role="alert">{developerError}</p>}<button className="primary-button" disabled={!developerPassword || savingDeveloperInfo} onClick={() => void openDeveloperManager()}>Continue <ArrowUpRight /></button></>}{modal === 'developer-manage' && <><div className="modal-icon"><LockKeyhole /></div><div className="modal-heading"><h2>Edit social links</h2><p>These URLs are saved securely in MongoDB.</p></div><label>Instagram URL<input type="url" value={developerInfo.instagram} onChange={(event) => setDeveloperInfo((current) => ({ ...current, instagram: event.target.value }))} /></label><label>LinkedIn URL<input type="url" value={developerInfo.linkedin} onChange={(event) => setDeveloperInfo((current) => ({ ...current, linkedin: event.target.value }))} /></label><label>GitHub URL<input type="url" value={developerInfo.github} onChange={(event) => setDeveloperInfo((current) => ({ ...current, github: event.target.value }))} /></label>{developerError && <p className="form-error" role="alert">{developerError}</p>}<button className="primary-button" disabled={savingDeveloperInfo} onClick={() => void saveDeveloperInfo()}><Save /> Save links</button></>}{modal === 'leave' && <><div className="modal-icon"><ArrowLeft /></div><div className="modal-heading"><h2>Leave this room?</h2><p>You will no longer receive new messages from this temporary room.</p></div><div className="leave-actions"><button className="secondary-button" onClick={() => setModal(null)}>Stay</button><button className="primary-button danger-button" onClick={leave}>Leave chat</button></div></>}</div></div>}
  </main>
}
