package app.faithcompanion;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * Serves temporary Cooking fridge photos from app-private cache storage (<cacheDir>/fridge-photos/)
 * so the camera's EXTRA_OUTPUT never enters the user's public Pictures gallery and the app never
 * deletes anything from MediaStore. Only strict wellness-fridge-<digits>.jpg names are accessible.
 */
public final class FridgePhotoProvider extends ContentProvider {
    private static final String[] DEFAULT_COLS = new String[]{
        OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE
    };

    @Override public boolean onCreate() {
        return true;
    }

    @Override public String getType(Uri uri) {
        String name = FridgePhoto.nameFromPath(uri == null ? null : uri.getPath());
        return name != null ? "image/jpeg" : null;
    }

    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        Context ctx = getContext();
        File file = ctx == null ? null : FridgePhoto.resolveFile(FridgePhoto.photoDir(ctx), uri == null ? null : uri.getPath());
        if (file == null) return null;
        String[] cols = projection != null && projection.length > 0 ? projection : DEFAULT_COLS;
        String[] outCols = new String[cols.length];
        Object[] row = new Object[cols.length];
        int n = 0;
        for (String col : cols) {
            if (OpenableColumns.DISPLAY_NAME.equals(col)) {
                outCols[n] = OpenableColumns.DISPLAY_NAME;
                row[n++] = file.getName();
            } else if (OpenableColumns.SIZE.equals(col)) {
                outCols[n] = OpenableColumns.SIZE;
                row[n++] = file.exists() ? file.length() : 0L;
            } else if ("_id".equals(col)) {
                outCols[n] = "_id";
                row[n++] = 1L;
            }
        }
        String[] finalCols = new String[n];
        Object[] finalRow = new Object[n];
        System.arraycopy(outCols, 0, finalCols, 0, n);
        System.arraycopy(row, 0, finalRow, 0, n);
        MatrixCursor cur = new MatrixCursor(finalCols, 1);
        cur.addRow(finalRow);
        return cur;
    }

    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        Context ctx = getContext();
        File dir = ctx == null ? null : FridgePhoto.photoDir(ctx);
        File file = FridgePhoto.resolveFile(dir, uri == null ? null : uri.getPath());
        if (file == null) throw new FileNotFoundException("Invalid fridge photo URI");
        int flags;
        try {
            flags = FridgePhoto.parseOpenMode(mode);
        } catch (IllegalArgumentException e) {
            throw new FileNotFoundException("Invalid open mode: " + mode);
        }
        if ((flags & ParcelFileDescriptor.MODE_CREATE) != 0 && dir != null && !dir.exists()) {
            dir.mkdirs();
        }
        return ParcelFileDescriptor.open(file, flags);
    }

    @Override public int delete(Uri uri, String selection, String[] selectionArgs) {
        Context ctx = getContext();
        File file = ctx == null ? null : FridgePhoto.resolveFile(FridgePhoto.photoDir(ctx), uri == null ? null : uri.getPath());
        return file != null && file.exists() && file.delete() ? 1 : 0;
    }

    @Override public Uri insert(Uri uri, ContentValues values) {
        throw new UnsupportedOperationException("No inserts");
    }

    @Override public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        throw new UnsupportedOperationException("No updates");
    }
}
