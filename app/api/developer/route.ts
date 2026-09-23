import getMongoClient from '@/lib/mongodb'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    const client = await getMongoClient()
    const db = client.db('quiet-chat')
    const collection = db.collection('developer-info')
    
    const developerInfo = await collection.findOne({ _id: 'main' })
    
    if (!developerInfo) {
      // Return default values if not found
      return NextResponse.json({
        instagram: process.env.NEXT_PUBLIC_INSTAGRAM_URL || '',
        linkedin: process.env.NEXT_PUBLIC_LINKEDIN_URL || '',
        github: process.env.NEXT_PUBLIC_GITHUB_URL || '',
      })
    }
    
    return NextResponse.json({
      instagram: developerInfo.instagram || process.env.NEXT_PUBLIC_INSTAGRAM_URL || 'https://instagram.com',
      linkedin: developerInfo.linkedin || process.env.NEXT_PUBLIC_LINKEDIN_URL || 'https://linkedin.com',
      github: developerInfo.github || process.env.NEXT_PUBLIC_GITHUB_URL || 'https://github.com',
    })
  } catch (error) {
    console.error('[v0] Failed to fetch developer info:', error)
    return NextResponse.json(
      { error: 'Failed to fetch developer info' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
  const { action, password, instagram, linkedin, github } = body
  const expectedPassword = process.env.DEVELOPER_PASSWORD || '@error'

  if (typeof password !== 'string' || password !== expectedPassword) {
    return NextResponse.json({ error: 'Incorrect developer password.' }, { status: 401 })
  }

  if (action === 'verify') {
    return NextResponse.json({ success: true })
  }

  if (![instagram, linkedin, github].every((value) => typeof value === 'string' && /^https:\/\//.test(value))) {
    return NextResponse.json({ error: 'Social links must be valid HTTPS URLs.' }, { status: 400 })
  }

  const client = await getMongoClient()
    const db = client.db('quiet-chat')
    const collection = db.collection('developer-info')
    
    const result = await collection.updateOne(
      { _id: 'main' },
      {
        $set: {
          instagram,
          linkedin,
          github,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    )
    
    return NextResponse.json({
      success: true,
      message: 'Developer info updated',
    })
  } catch (error) {
    console.error('[v0] Failed to update developer info:', error)
    return NextResponse.json(
      { error: 'Failed to update developer info' },
      { status: 500 }
    )
  }
}
