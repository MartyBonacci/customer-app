import qrcode from "qrcode";
import invariant from "tiny-invariant";
import db from "../db.server";

type QRCodeType = {
  id: string;
  title: string;
  shop: string;
  productId: string;
  productHandle: string;
  productVariantId?: string;
  destination: string;
  scans: number;
  createdAt: Date;
};

export async function getQRCode(id: string, graphql: any) {
  const qrCode = await db.QrCode.findFirst({ where: { id } });

  if (!qrCode) {
    return null;
  }

  return supplementQRCode(qrCode, graphql);
}

export async function getQRCodes(shop: string, graphql: any) {
  const qrCodes = await db.QrCode.findMany({
    where: { shop },
    orderBy: { id: "desc" },
  });

  if (qrCodes.length === 0) return [];

  return Promise.all(
    qrCodes.map((qrCode: QRCodeType) => supplementQRCode(qrCode, graphql))
  );
}

async function supplementQRCode(qrCode: QRCodeType, graphql: any) {
  const qrCodeImagePromise = getQRCodeImage(qrCode.id);

  const response = await graphql(
    `
      query supplementQRCode($id: ID!) {
        product(id: $id) {
          title
          media(first: 1) {
            nodes {
              ... on MediaImage {
                image {
                  altText
                  url
                }
              }
            }
          }
        }
      }
    `,
    {
      variables: {
        id: qrCode.productId,
      },
    }
  );

  const {
    data: { product },
  } = await response.json();

  return {
    ...qrCode,
    productDeleted: !product?.title,
    productTitle: product?.title,
    productImage: product?.media?.nodes[0]?.image?.url,
    productAlt: product?.media?.nodes[0]?.image?.altText,
    destinationUrl: getDestinationUrl(qrCode),
    image: await qrCodeImagePromise,
  };
}

export function getDestinationUrl(qrCode: QRCodeType) {
  if (qrCode.destination === "product") {
    return `https://${qrCode.shop}/products/${qrCode.productHandle}`;
  }

  invariant(qrCode.productVariantId, "Product variant ID is required");
  const match = /gid:\/\/shopify\/ProductVariant\/([0-9]+)/.exec(qrCode.productVariantId);
  invariant(match, "Unrecognized product variant ID");

  return `https://${qrCode.shop}/cart/${match[1]}:1`;
}

export function getQRCodeImage(id: string) {
  const url = new URL(`/qrcodes/${id}/scan`, process.env.SHOPIFY_APP_URL);
  return qrcode.toDataURL(url.href);
}

