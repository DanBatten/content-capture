import { PubSub } from '@google-cloud/pubsub';
import type { CaptureMessage } from '@content-capture/core';

// Lazy initialization to avoid build-time errors
let _pubsub: PubSub | null = null;

function getPubSubClient(): PubSub {
  if (_pubsub) return _pubsub;

  // Uses GOOGLE_APPLICATION_CREDENTIALS env var for auth
  // Or defaults to Application Default Credentials on GCP
  _pubsub = new PubSub({
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  });

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
