import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { verifyToken } from '@/lib/auth';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// H-1: Authenticate admin before allowing uploads
async function authenticateAdmin(request: Request): Promise<{ authorized: boolean; errorResponse?: NextResponse }> {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return {
      authorized: false,
      errorResponse: NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
    };
  }

  const payload = verifyToken(token);
  if (!payload || payload.role !== 'admin') {
    return {
      authorized: false,
      errorResponse: NextResponse.json({ error: 'Admin access required' }, { status: 403 }),
    };
  }

  return { authorized: true };
}

export async function POST(request: Request) {
  try {
    // H-1: Require admin authentication for uploads
    const { authorized, errorResponse } = await authenticateAdmin(request);
    if (!authorized) return errorResponse;

    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // H-2: Validate file type and size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum size is 5MB.' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPEG, PNG, and WebP images are allowed.' },
        { status: 400 }
      );
    }

    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    // C-2: Read from server-only env var
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    const apiKey = process.env.CLOUDINARY_API_KEY;

    if (apiKey && apiSecret && apiKey === apiSecret) {
      // H-8: Generic error message, no leaked values
      return NextResponse.json(
        { error: 'Cloudinary configuration error. Please check your API credentials in the server environment.' },
        { status: 400 }
      );
    }

    if (!cloudName || cloudName === 'dk6aax1vi_placeholder') {
      return NextResponse.json({
        url: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=600&q=80',
        warning: 'Cloudinary Cloud Name is not configured. Falling back to placeholder image.'
      });
    }

    const cloudinaryFormData = new FormData();
    cloudinaryFormData.append('file', file);

    // Check if we can perform a SIGNED upload (requires API Key and API Secret)
    if (
      apiKey &&
      apiSecret &&
      apiKey !== 'placeholder_api_key' &&
      apiSecret !== 'placeholder_api_secret'
    ) {
      const timestamp = Math.round(new Date().getTime() / 1000);
      
      const signString = `timestamp=${timestamp}${apiSecret}`;
      const signature = crypto
        .createHash('sha1')
        .update(signString)
        .digest('hex');

      cloudinaryFormData.append('api_key', apiKey);
      cloudinaryFormData.append('timestamp', timestamp.toString());
      cloudinaryFormData.append('signature', signature);

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        {
          method: 'POST',
          body: cloudinaryFormData,
        }
      );

      const data = await response.json();

      if (data.error) {
        // H-8: Log details server-side, return generic message to client
        console.error('[Cloudinary Signed Upload Error]:', data.error.message);
        return NextResponse.json(
          { error: 'Image upload failed. Please verify your Cloudinary configuration.' },
          { status: 400 }
        );
      }

      return NextResponse.json({ url: data.secure_url });
    } else {
      // Perform an UNSIGNED upload (requires upload_preset)
      const uploadPreset =
        process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'ml_default';
      cloudinaryFormData.append('upload_preset', uploadPreset);

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        {
          method: 'POST',
          body: cloudinaryFormData,
        }
      );

      const data = await response.json();

      if (data.error) {
        // H-8: Log details server-side, return generic message to client
        console.error('[Cloudinary Unsigned Upload Error]:', data.error.message);
        return NextResponse.json(
          { error: 'Image upload failed. Please check Cloudinary upload preset configuration.' },
          { status: 400 }
        );
      }

      return NextResponse.json({ url: data.secure_url });
    }
  } catch (error: unknown) {
    // L-5: Use unknown instead of any
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Upload API Error]:', message);
    // H-8: Generic error to client
    return NextResponse.json(
      { error: 'An unexpected server error occurred during upload.' },
      { status: 500 }
    );
  }
}
