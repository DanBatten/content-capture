import { PubSub } from '@google-cloud/pubsub';
import type { CaptureMessage, NoteMessage } from '@content-capture/core';

// Lazy initialization to avoid build-time errors
let _pubsub: PubSub | null = null;

function getPubSubClient(): PubSub {
  if (_pubsub) return _pubsub;

  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;

  // Check for JSON credentials (for Vercel/serverless deployment)
  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (credentialsJson) {
    const credentials = JSON.parse(credentialsJson);
    _pubsub = new PubSub({
      projectId,
      credentials,
    });
  } else {
    // Uses GOOGLE_APPLICATION_CREDENTIALS env var for auth (local dev)
    // Or defaults to Application Default Credentials on GCP
    _pubsub = new PubSub({ projectId });
  }

  return _pubsub;
}

function getTopicName(): string {
  const topic = process.env.GOOGLE_CLOUD_PUBSUB_TOPIC;
  if (!topic) {
    throw new Error('GOOGLE_CLOUD_PUBSUB_TOPIC environment variable is not set');
  }
  return topic;
}

/**
 * Send a capture message to the processing queue
 */
export async function sendToQueue(message: CaptureMessage): Promise<boolean> {
  try {
    const pubsub = getPubSubClient();
    const topic = pubsub.topic(getTopicName());

    const messageBuffer = Buffer.from(JSON.stringify(message));

    await topic.publishMessage({
      data: messageBuffer,
      attributes: {
        sourceType: message.sourceType,
        captureId: message.captureId,
      },
    });

    return true;
  } catch (error) {
    console.error('Error sending message to Pub/Sub:', error);
    return false;
  }
}

/**
 * Send a note message to the processing queue
 */
export async function sendNoteToQueue(message: NoteMessage): Promise<boolean> {
  try {
    const pubsub = getPubSubClient();
    const topic = pubsub.topic(getTopicName());

    const messageBuffer = Buffer.from(JSON.stringify(message));

    await topic.publishMessage({
      data: messageBuffer,
      attributes: {
        messageType: 'note',
        noteId: message.noteId,
        userId: message.userId,
        traceId: message.traceId,
      },
    });

    return true;
  } catch (error) {
    console.error('Error sending note message to Pub/Sub:', error);
    return false;
  }
}
