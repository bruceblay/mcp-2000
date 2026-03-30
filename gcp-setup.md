# GCP Setup Commands

Run these one at a time.

## IAM Policy Bindings

```
gcloud projects add-iam-policy-binding mcp-2000 --member=serviceAccount:mcp-2000-share@mcp-2000.iam.gserviceaccount.com --role=roles/datastore.user
```

```
gcloud projects add-iam-policy-binding mcp-2000 --member=serviceAccount:mcp-2000-share@mcp-2000.iam.gserviceaccount.com --role=roles/storage.objectAdmin
```

## Download Service Account Key

```
gcloud iam service-accounts keys create ./gcp-service-account.json --iam-account=mcp-2000-share@mcp-2000.iam.gserviceaccount.com
```

## Vercel Environment Variables

```
echo "mcp-2000" | vercel env add GCP_PROJECT_ID production
```

```
echo "mcp-2000-samples" | vercel env add GCS_BUCKET_NAME production
```

```
cat gcp-service-account.json | vercel env add GCP_SERVICE_ACCOUNT_KEY production
```

```
openssl rand -hex 32 | vercel env add CRON_SECRET production
```
