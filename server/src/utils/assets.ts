import { getSignedAssetUrl } from '../services/storage.js';

const IMAGE_URL_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7;

type MaybeUserWithAvatar = {
  avatar_url?: string | null;
};

type MaybeBeatWithCover = {
  cover_image?: string | null;
};

type MaybeBannerWithImage = {
  image_url?: string | null;
};

export function serializeUserAssets<T extends MaybeUserWithAvatar>(user: T): T {
  return {
    ...user,
    avatar_url: getSignedAssetUrl('avatar', user.avatar_url, {
      expiresInSeconds: IMAGE_URL_EXPIRES_IN_SECONDS
    })
  };
}

export function serializeBeatAssets<T extends MaybeBeatWithCover>(beat: T): T {
  return {
    ...beat,
    cover_image: getSignedAssetUrl('cover', beat.cover_image, {
      expiresInSeconds: IMAGE_URL_EXPIRES_IN_SECONDS
    })
  };
}

export function serializeBannerAssets<T extends MaybeBannerWithImage>(banner: T): T {
  return {
    ...banner,
    image_url: getSignedAssetUrl('banner', banner.image_url, {
      expiresInSeconds: IMAGE_URL_EXPIRES_IN_SECONDS
    })
  };
}
