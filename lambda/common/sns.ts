import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const client = new SNSClient({});
const TOPIC_ARN = process.env.NOTIFY_TOPIC_ARN!;

export async function publishNotification(subject: string, message: string): Promise<void> {
  await client.send(
    new PublishCommand({
      TopicArn: TOPIC_ARN,
      // Subject is truncated by SNS at 100 chars for the email protocol.
      Subject: subject.slice(0, 100),
      Message: message,
    })
  );
}
