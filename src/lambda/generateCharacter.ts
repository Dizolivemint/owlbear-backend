import { supabase } from '@/lib/supabaseBackendClient';
import { ApiClient } from '@/lib/apiClient';
import { Database, Json } from '@/lib/database.types';
import * as OneSignal from 'onesignal-node';  

export const handler = async () => {
  const apiClient = new ApiClient();

  try {
    // Read data from Supabase table
    const { data, error } = await supabase.from('requests')
      .select('*')
      .eq('isProcessed', 'false')
      .order('created_at', { ascending: true })
      .limit(1);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      console.log('No unprocessed requests found');
      return;
    }

    const request = data[0];
    const { size, species, challengeRating, isLegendary, user } = request;

    // Generate character
    const characterResponse = await apiClient.generateCharacter({
      size,
      species,
      challengeRating,
      isLegendary
    });

    const characterJson: Json = await JSON.parse(JSON.stringify(characterResponse.character));

    const character: Database['public']['Tables']['characters']['Insert'] = {
      character_data: characterJson,
      image_filename: characterResponse.imageUrl,
      user_id: user
    }
    
    const { data: insertCharData, error: insertCharError } = await supabase
      .from('characters')
      .insert([character])

    if (insertCharError) {
      throw insertCharError;
    }

    console.log('Inserted data', insertCharData);

    // Write data to Supabase table
    const { data: updateReqData, error: updateReqError } = await supabase.from('requests').update([
      { isProcessed: true },
    ]).eq('uuid', request.uuid);

    if (updateReqError) {
      throw updateReqError;
    }

    console.log('Updated data', updateReqData);

    await sendEmail(character.user_id)
    await sendPushNotification(character.user_id)
  } catch (error) {
    console.error('Error:', error);
  }
};

async function sendEmail(userId: string) {
  const client = require('@sendgrid/mail');
  client.setApiKey(process.env.SENDGRID_API_KEY);

  try {
    const { data: userData, error: userError } = await supabase.from('profiles').select('email').eq('id', userId);

    if (userError) {
      throw userError;
    }

    const email = userData[0].email;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL

    const message = {
      personalizations: [
        {
          to: [
            {
              email
            }
          ]
        }
      ],
      from: {
        email: fromEmail,
        name: 'Owlbear Online'
      },
      template_id: 'd-72929132023a4ff5892ff516c45ac8d1'
    };
    
    await client
      .send(message)
      .then(() => {
        console.log('Mail sent successfully')
      })
      .catch(error => {
        console.error(error);
      });

  } catch (error) {
    console.error('Error:', error);
  }

  return
}

async function sendPushNotification(userId: string) {
  try {
    const appId = process.env.ONESIGNAL_APP_ID;
    const apiKey = process.env.ONESIGNAL_REST_API_KEY;
    const client = new OneSignal.Client(appId, apiKey);

    const notification = {
      contents: {
        en: 'Your monster is ready!',
      },
      include_external_user_ids: [userId],
    };

    // Send the push notification
    await client.createNotification(notification);
    console.log('Push notification sent successfully');
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
}