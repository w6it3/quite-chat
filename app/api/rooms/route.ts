import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import getMongoClient from '@/lib/mongodb'

export const runtime = 'nodejs'

const dbName = 'quiet_chat'
const rooms = 'rooms'
const messages = 'messages'
const expiryMs = 5 * 60 * 1000

function code() {
  return randomBytes(4).toString('base64url').slice(0, 6).toUpperCase()
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const roomCode = code()
    const now = new Date()
    const client = await getMongoClient()
    const database = client.db(dbName)
    await database.collection(rooms).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    await database.collection(messages).createIndex({ roomCode: 1, createdAt: 1 })
    const limit = Math.min(6, Math.max(2, Number(body.limit) || 4))
    const clientId = String(body.clientId || '').slice(0, 100)
    await database.collection(rooms).insertOne({ roomCode, name: String(body.name || 'Quiet room').slice(0, 40), limit, members: 1, participants: clientId ? [{ clientId, name: 'You' }] : [], creatorId: clientId, lastActivityAt: now, expiresAt: new Date(now.getTime() + expiryMs), createdAt: now })
    return NextResponse.json({ roomCode })
  } catch (error) {
    console.error('[v0] Failed to create room:', error)
    return NextResponse.json({ error: 'Unable to create room. Please try again.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({}))
  const roomCode = String(body.roomCode || '').toUpperCase()
  const clientId = String(body.clientId || '')
  if (!roomCode || !clientId) return NextResponse.json({ error: 'Room and creator are required' }, { status: 400 })
  const client = await getMongoClient()
  const database = client.db(dbName)
  const result = await database.collection(rooms).deleteOne({ roomCode, creatorId: clientId })
  if (!result.deletedCount) return NextResponse.json({ error: 'Only the room creator can close this room' }, { status: 403 })
  await database.collection(messages).deleteMany({ roomCode })
  return NextResponse.json({ closed: true })
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const roomCode = url.searchParams.get('code')?.toUpperCase()
  if (!roomCode) return NextResponse.json({ error: 'Room code is required' }, { status: 400 })
  const client = await getMongoClient()
  const database = client.db(dbName)
  const room = await database.collection(rooms).findOne({ roomCode })
  if (!room || room.expiresAt < new Date()) return NextResponse.json({ error: 'Room not found or expired' }, { status: 404 })
  const clientId = url.searchParams.get('clientId') || ''
  const participants = Array.isArray(room.participants) ? room.participants : []
  let participant = participants.find((item: { clientId: string }) => item.clientId === clientId)
  if (clientId && !participant) {
    const guestCount = participants.filter((item: { name: string }) => item.name.startsWith('Guest')).length
    const name = room.limit <= 2 && participants.length === 1 ? 'Someone' : `Guest ${guestCount + 1}`
    participant = { clientId, name }
    await database.collection(rooms).updateOne({ roomCode }, { $push: { participants: participant }, $inc: { members: 1 } })
  }
  const roomMessages = await database.collection(messages).find({ roomCode }).sort({ createdAt: 1 }).limit(200).toArray()
  return NextResponse.json({ room: { ...room, _id: undefined }, messages: roomMessages.map(({ _id, senderId, ...message }) => ({ ...message, senderId, mine: senderId === clientId, time: new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) })) })
}
