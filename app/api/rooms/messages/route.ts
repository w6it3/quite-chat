import { NextResponse } from 'next/server'
import getMongoClient from '@/lib/mongodb'

export const runtime = 'nodejs'

const expiryMs = 5 * 60 * 1000

export async function POST(request: Request) {
  const body = await request.json()
  const roomCode = String(body.roomCode || '').toUpperCase()
  const text = String(body.text || '').trim().slice(0, 4000)
  const senderId = String(body.senderId || '').slice(0, 100)
  const client = await getMongoClient()
  const database = client.db('quiet_chat')
  const room = await database.collection('rooms').findOne({ roomCode })
  if (!room || room.expiresAt < new Date()) return NextResponse.json({ error: 'Room not found or expired' }, { status: 410 })
  if (body.typing === true || body.typing === false) {
    const typingUntil = body.typing ? new Date(Date.now() + 3000) : new Date(0)
    await database.collection('rooms').updateOne({ roomCode, 'participants.clientId': senderId }, { $set: { 'participants.$.typingUntil': typingUntil } })
    return NextResponse.json({ ok: true })
  }
  const attachment = body.attachment && typeof body.attachment.dataUrl === 'string' ? {
    name: String(body.attachment.name || 'image').slice(0, 200),
    type: String(body.attachment.type || 'image/*').slice(0, 100),
    dataUrl: String(body.attachment.dataUrl).slice(0, 6_000_000),
  } : undefined
  if (!roomCode || (!text && !attachment) || !senderId) return NextResponse.json({ error: 'Room, sender, and message are required' }, { status: 400 })
  const createdAt = new Date()
  const participant = Array.isArray(room.participants) ? room.participants.find((item: { clientId: string }) => item.clientId === senderId) : null
  const message = { id: crypto.randomUUID(), roomCode, senderId, from: participant?.name || 'Someone', text, attachment, createdAt }
  await database.collection('messages').insertOne(message)
  await database.collection('rooms').updateOne({ roomCode }, { $set: { lastActivityAt: createdAt, expiresAt: new Date(createdAt.getTime() + expiryMs) } })
  return NextResponse.json({ ...message, mine: true, time: createdAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) })
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const roomCode = url.searchParams.get('code')?.toUpperCase()
  const clientId = url.searchParams.get('clientId') || ''
  const after = Number(url.searchParams.get('after') || 0)
  if (!roomCode) return NextResponse.json({ error: 'Room code is required' }, { status: 400 })
  const client = await getMongoClient()
  const database = client.db('quiet_chat')
  const room = await database.collection('rooms').findOne({ roomCode })
  if (!room || room.expiresAt < new Date()) return NextResponse.json({ error: 'Room expired' }, { status: 410 })
  const participants = Array.isArray(room.participants) ? room.participants : []
  const members = participants.length
  const result = await database.collection('messages').find({ roomCode, createdAt: { $gt: new Date(after || 0) } }).sort({ createdAt: 1 }).limit(100).toArray()
  const typingUsers = participants.filter((item: { clientId: string; typingUntil?: Date }) => item.clientId !== clientId && item.typingUntil && new Date(item.typingUntil).getTime() > Date.now()).length
  return NextResponse.json({ members, typingUsers, participants: participants.map(({ clientId, name }: { clientId: string; name: string }) => ({ clientId, name })), messages: result.map(({ _id, senderId, ...message }) => ({ ...message, senderId, mine: senderId === clientId, time: new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) })) })
}
