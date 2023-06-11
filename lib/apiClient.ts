import { Character } from '@/lib/app.types';
import fetch from 'node-fetch';

type GenerateCharacterResponse = {
  character?: Character;
  imageUrl?: string;
  imageFetchUrl?: string;
  error?: string;
}

export class ApiClient {
  private apiKey: string;
  private apiEndpoint: string;
  private apiImageEndpoint: string;
  // private bucket: string;
  private stablediffusionApiKey: string;

  constructor() {
    this.apiKey = process.env.CHATGPT_API_KEY || '';
    this.apiEndpoint = 'https://api.openai.com/v1/completions';
    this.apiImageEndpoint = process.env.STABLEDIFFUSION_API_ENDPOINT || '';
    // this.bucket = 'images_public';
    this.stablediffusionApiKey = process.env.STABLEDIFFUSION_API_KEY || '';
  }

  private checkKey() {
    if (this.apiKey === '') {
      throw new Error('No API key provided');
    }
  }

  async requestGPT(prompt: string): Promise<any> {
    const requestBody = {
      "model": "text-davinci-003",
      "prompt": prompt,
      "max_tokens": 1000,
      "stream": false,
      "logprobs": null
    };

    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Error: ${response.statusText}`);
      }

      
      const uint8ArrayResponseBody = await response.arrayBuffer(); // Get response body as Uint8Array
      const responseBody = JSON.parse(new TextDecoder().decode(uint8ArrayResponseBody)); // Parse the JSON response

      return responseBody;
    } catch (error) {
      console.error('ChatGPT', error);
      return { error: 'Error from ChatGPT' };
    }
  }
  
  async generateCharacter(request: { size: string, species: string, challengeRating: string, isLegendary: boolean }): Promise<GenerateCharacterResponse> {
    this.checkKey();

    const { size, species, challengeRating, isLegendary } = request;

    const prompt = `Create a Dungeons and Dragons 5e${species} with the challenge rating of ${challengeRating}. Present the data in the following JSON string format in one line (i.e., no line breaks): { "name": string, "background": string, "appearance": string, "attributes": { "STR": number, "DEX": number, "CON": number, "INT": number, "WIS": number, "CHA": number }, "skills": [{ "skill": string, "description": string }], "actions": [{ "action": string, "description": string }], "reactions": [{ "reaction": string, "description": string }]${isLegendary && ', "legendary_actions": [{ "legendary_action": string, "description": string }]'} }. When applicable, skill, action, and reaction descriptions should include the dice modifier (e.g., +5) or dice roll (e.g., 2d8) and the damage type (e.g., slashing, fire).`
      
    const responseBody = await this.requestGPT(prompt);
    if (responseBody.error) {
      throw new Error(responseBody.error);
    }

    console.log('responseBody', responseBody)

    const character: Character = {
      name: '',
      species: species,
      challenge_rating: challengeRating,
      attributes: {
        STR: 0,
        DEX: 0,
        CON: 0,
        INT: 0,
        WIS: 0,
        CHA: 0,
      },
      skills: [{ skill: '', description: '' }],
      actions: [{ action: '', description: '' }],
      reactions: [{ reaction: '', description: ''}],
      description: '',
      background: '',
      size,
      appearance: '',
    };

    // Get the first choice text, trim it, sanitize it, and parse it as JSON
    const choiceText = responseBody.choices[0].text.trim();
    const jsonStartIndex = choiceText.indexOf('{');
    const jsonEndIndex = choiceText.lastIndexOf('}') + 1;
    const trimmedJson = choiceText.slice(jsonStartIndex, jsonEndIndex);
    let parsedData
    try {
      parsedData = JSON.parse(trimmedJson);
    } catch (error) {
      console.error('Error parsing JSON:', error);
      this.generateCharacter(request)
      return
    }

    // Assign the parsed values to the character object
    character.attributes = getPropInsensitive(parsedData, 'attributes');
    if (!character.attributes || Object.values(character.attributes).some(val => !val)) {
      throw new Error('Attributes are empty or undefined');
    }

    character.skills = getPropInsensitive(parsedData, 'skills');
    if (!character.skills || Object.values(character.skills).some(val => !val)) {
      throw new Error('Skills are empty or undefined');
    }

    character.actions = getPropInsensitive(parsedData, 'actions');
    if (!character.actions || Object.values(character.actions).some(val => !val)) {
      throw new Error('Actions are empty or undefined');
    }

    character.reactions = getPropInsensitive(parsedData, 'reactions');

    if (isLegendary) character.legendary_actions = getPropInsensitive(parsedData, 'legendary_actions');

    character.background = getPropInsensitive(parsedData, 'background');
    if (!character.background) {
      throw new Error('Background is empty or undefined');
    }

    character.name = getPropInsensitive(parsedData, 'name');
    if (!character.name) {
      throw new Error('Name is empty or undefined');
    }
    
    character.appearance = getPropInsensitive(parsedData, 'appearance');
    if (!character.appearance) {
      throw new Error('Appearance is empty or undefined');
    }

    // Create a Stable Diffusion prompt using the character's name and appearance
    const chatGptStableDiffusionPrompt = `Turn the appearance at the end into boorus tags separated by commas in a one line prompt. Include these tags in the beginning of the prompt 'A (full body:1.3) shot at 8k resolution, splash art, fantastic comic book style, photorealistic, anatomical photorealistic digital painting portrait'. at the end of the prompt, add the tags ', (insanely detailed, bloom:1.5), (highest quality, Alessandro Casagrande, Greg Rutkowski, Sally Mann, concept art, 4k)'. Appearance: ${character.appearance}`

    // Wait for next request
    const delay = 15000;
    await new Promise((resolve) => setTimeout(resolve, delay));

    // Get the Stable Diffusion prompt
    const stableDiffusionPromptResponse = await this.requestGPT(chatGptStableDiffusionPrompt);
    if (stableDiffusionPromptResponse.error) {
      throw new Error(stableDiffusionPromptResponse.error);
    }
    const stableDiffusionPrompt = stableDiffusionPromptResponse.choices[0].text.trim();
    console.log('Stable Diffusion Prompt', stableDiffusionPrompt);

    // Get image url
    const images = await this.createImage(stableDiffusionPrompt);
    if (!images) {
      throw new Error('Image url is empty or undefined');
    }
    const imageUrl = typeof images === 'string' ? images : images[0];
    console.log('imageUrl', imageUrl);
    
    if (!imageUrl) {
      throw new Error('Image url is empty or undefined');
    }

    return { character, imageUrl };
  }

  async createImage(prompt: string): Promise<string[] | string> {
    type ApiResponse = {
      status: string;
      generationTime?: number;
      tip?: string;
      eta?: number;
      fetch_result?: string;
      id: number;
      output: string[];
      meta: {
        prompt: string;
        model_id: string;
        message: string;
        fetch_result: string;
        eta: number;
        negative_prompt: string;
        scheduler: string;
        safety_checker: string;
        W: number;
        H: number;
        guidance_scale: number;
        seed: number;
        steps: number;
        n_samples: number;
        full_url: string;
        upscale: string;
        multi_lingual: string;
        panorama: string;
        self_attention: string;
        embeddings: null;
        lora: null;
        outdir: string;
        file_prefix: string;
      };
    };
     
    const requestBody = {
      "key": this.stablediffusionApiKey,
      "model_id": "rpg-v4",
      prompt,
      negative_prompt: "(low quality, worst quality:1.4), lowres, bad hands out of frame, extra fingers, mutated hands, (poorly drawn hands:1.21), (poorly drawn face:1.21), blurry, cloned face, glitchy, out of frame, (text), (((watermark))), (watermarking), (((nudity))), (((nipples))), (((nsfw)))",
      "width": "512",
      "height": "768",
      "samples": "1",
      "num_inference_steps": "31",
      "safety_checker": "no",
      "enhance_prompt": "no",
      "seed": null,
      "guidance_scale": 6,
      "multi_lingual": "no",
      "panorama": "no",
      "self_attention": "no",
      "upscale": "no",
      "embeddings_model": "",
      "lora_model": "",
      "scheduler": "DDPMScheduler",
      "webhook": null,
      "track_id": null
    };

    try {
      const response = await fetch(this.apiImageEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Error: ${response.statusText}`);
      }
      
      const uint8ArrayResponseBody = await response.arrayBuffer(); // Get response body as Uint8Array
      const responseBody: ApiResponse = JSON.parse(new TextDecoder().decode(uint8ArrayResponseBody)); // Parse the JSON response

      // console.log('responseBody', responseBody)

      if (responseBody?.status !== 'success') {
        if (responseBody.status === 'processing' && responseBody?.fetch_result) {
          console.log('Image is still processing...');
          const imageFetchUrl = responseBody?.fetch_result;
          const eta = responseBody?.eta;
          console.log('eta', eta);
          
          const delay = (eta * 1.2) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
          
          let image = await this.fetchImage(imageFetchUrl);
          console.log('image', image);
          
          if (!image) {
            let retries = 0;
            while (!image && retries < 5) {
              retries++;
              console.log('Retrying fetching image...');
              const delay = (eta) * 1000;
              await new Promise((resolve) => setTimeout(resolve, delay));
              image = await this.fetchImage(imageFetchUrl);  
            }
          }
          if (!image) {
            throw new Error('Image url is empty or undefined');
          }
          
          return image;
        } else {
          return await this.createDalleImage(prompt);
        }
      }

      // Upload images to Supabase storage
      const imageUrls = responseBody.output;
      if (!imageUrls || imageUrls.length === 0) {
        throw new Error('No images generated');
      }
      const uploadedImages = await Promise.all(
        imageUrls.map(async (url) => {
          return url;
        }),
      );

      return uploadedImages.filter((url) => url !== null) as string[];
    } catch (error) {
      console.error('Error generating image:', error);
      return '';
    }
  }

  async createDalleImage(description: string) {
    type ApiResponse = {
      created: number;
      data: { url: string }[];
    }    

    const requestBody = {
      "prompt": description,
      "n": 1,
      "size": "512x512"
    };

    try {
      const response = await fetch(this.apiImageEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Error: ${response.statusText}`);
      }
      
      const uint8ArrayResponseBody = await response.arrayBuffer(); // Get response body as Uint8Array
      const responseBody: ApiResponse = JSON.parse(new TextDecoder().decode(uint8ArrayResponseBody)); // Parse the JSON response

      console.log('responseBody', responseBody)

      // Upload images to Supabase storage
      const imageUrls = responseBody.data;
      if (!imageUrls || imageUrls.length === 0) {
        throw new Error('No images generated');
      }
      const uploadedImages = await Promise.all(
        imageUrls.map(async (url, index) => {
          return url.url;
        }),
      );

      return uploadedImages.filter((url) => url !== null) as string[];
    } catch (error) {
      console.error('Error generating image:', error);
      return [];
    }
  }

  // async convertImageToJpg(url: string, name: string, index: number): Promise<string> {
  //   // Fetch the image as a Buffer
  //   const imageResponse = await fetch(url);
  //   const imageArrayBuffer = await imageResponse.arrayBuffer();
  //   const imageBuffer = Buffer.from(imageArrayBuffer);

  //   // Convert the image to JPG format using sharp
  //   const convertedImageBuffer = await sharp(imageBuffer).toFormat('jpeg').toBuffer();

  //   // Upload the converted image to Supabase storage
  //   const fileName = `${name.replace(/\s/g, '')}-${index}.jpg`;
  //   const { data, error } = await supabase.storage
  //     .from('images_public')
  //     .upload(fileName, convertedImageBuffer);

  //   if (error) {
  //     console.error(`Error uploading image ${fileName}:`, error);
  //     return '';
  //   }

  //   // Get the public URL of the uploaded image
  //   const publicUrl = `/${this.bucket}/${fileName}`;
  //   return publicUrl;
  // }

  async fetchImage(url: string) {
    type ApiResponse = {
      status: string;
      id: number;
      output: string[];
    }

    const requestBody = {
      "key": this.stablediffusionApiKey,
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Error: ${response.statusText}`);
      }
      
      const uint8ArrayResponseBody = await response.arrayBuffer(); // Get response body as Uint8Array
      const responseBody: ApiResponse = JSON.parse(new TextDecoder().decode(uint8ArrayResponseBody)); // Parse the JSON response

      console.log('responseBody', responseBody)

      return responseBody.output[0] || ''
    } catch (error) {
      console.error('Error generating image:', error);
      return '';
    }
  }
}

function getPropInsensitive(obj: any, prop: string) {
  const lowerProp = prop.toLowerCase();
  for (let key in obj) {
    if (key.toLowerCase() === lowerProp) {
      if (obj[key] === undefined || obj[key] === '') {
        throw new Error(`Property ${prop} is empty or undefined`);
      }
      return obj[key];
    }
  }
  throw new Error(`Property ${prop} not found`);
}
