package tech.mux1.jpn;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

/** Android shell for the learning app. Marketing and administration stay in the browser. */
public final class MainActivity extends Activity {
    private static final String HOME = "https://jpn.mux1.tech/learn/";
    private WebView web;
    private LinearLayout offline;
    private ProgressBar progress;
    private PermissionRequest microphone;

    private static boolean trusted(Uri uri) {
        return uri != null && "https".equals(uri.getScheme())
            && "jpn.mux1.tech".equals(uri.getHost())
            && (uri.getPort() == -1 || uri.getPort() == 443);
    }
    private static boolean learning(Uri uri) {
        String path = uri == null ? null : uri.getPath();
        return trusted(uri) && path != null && (path.equals("/learn") || path.startsWith("/learn/"));
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(255,254,250));
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets edge = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(edge.left,edge.top,edge.right,edge.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(255,254,250));
        root.addView(web,new FrameLayout.LayoutParams(-1,-1));
        progress = new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);
        root.addView(progress,new FrameLayout.LayoutParams(-1,6));
        offline = new LinearLayout(this);
        offline.setOrientation(LinearLayout.VERTICAL);
        offline.setGravity(android.view.Gravity.CENTER);
        offline.setPadding(32,32,32,32);
        offline.setBackgroundColor(Color.rgb(255,254,250));
        TextView title = new TextView(this);
        title.setText("暂时无法打开学习页面");
        title.setTextColor(Color.rgb(36,50,55));title.setTextSize(23);
        offline.addView(title);
        TextView copy = new TextView(this);
        copy.setText("检查网络连接后再试。已同步的学习进度保存在账号中。");
        copy.setTextSize(15);copy.setPadding(0,20,0,24);
        offline.addView(copy);
        Button retry = new Button(this);retry.setText("重新连接");
        retry.setOnClickListener(v -> { offline.setVisibility(View.GONE);web.loadUrl(HOME); });
        offline.addView(retry);
        root.addView(offline,new FrameLayout.LayoutParams(-1,-1));
        offline.setVisibility(View.GONE);
        setContentView(root);
        WebSettings settings=web.getSettings();
        settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSafeBrowsingEnabled(true);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request) {
                Uri uri=request.getUrl();
                if(!request.isForMainFrame())return !trusted(uri) && !("https".equals(uri.getScheme()) && "challenges.cloudflare.com".equals(uri.getHost()));
                if(learning(uri))return false;
                openBrowser(uri);return true;
            }
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap favicon) {
                denyMicrophone();progress.setVisibility(View.VISIBLE);
                if(!learning(Uri.parse(url))){view.stopLoading();openBrowser(Uri.parse(url));view.loadUrl(HOME);}
            }
            @Override public void onPageFinished(WebView view,String url) {
                progress.setVisibility(View.GONE);CookieManager.getInstance().flush();
            }
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error) {
                if(request.isForMainFrame()){progress.setVisibility(View.GONE);offline.setVisibility(View.VISIBLE);}
            }
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public void onProgressChanged(WebView view,int value){progress.setProgress(value);}
            @Override public void onPermissionRequest(PermissionRequest request){runOnUiThread(()->{
                if(!trusted(request.getOrigin()) || !learning(Uri.parse(web.getUrl()))){request.deny();return;}
                boolean audio=false;for(String resource:request.getResources())if(PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource))audio=true;
                if(!audio){request.deny();return;}
                denyMicrophone();microphone=request;
                if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)grantMicrophone();
                else requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},73);
            });}
            @Override public void onPermissionRequestCanceled(PermissionRequest request){if(microphone==request)microphone=null;}
        });
        web.setDownloadListener((url,userAgent,disposition,mime,size)->openBrowser(Uri.parse(url)));
        web.loadUrl(HOME);
    }
    private void grantMicrophone(){
        PermissionRequest request=microphone;microphone=null;
        if(request==null)return;
        if(trusted(request.getOrigin()) && learning(Uri.parse(web.getUrl())))request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        else request.deny();
    }
    private void denyMicrophone(){if(microphone!=null){microphone.deny();microphone=null;}}
    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] results){
        super.onRequestPermissionsResult(code,permissions,results);
        if(code==73){if(results.length>0 && results[0]==PackageManager.PERMISSION_GRANTED)grantMicrophone();else denyMicrophone();}
    }
    private void openBrowser(Uri uri){
        if(uri==null || !("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())))return;
        try{startActivity(new Intent(Intent.ACTION_VIEW,uri).addCategory(Intent.CATEGORY_BROWSABLE));}catch(android.content.ActivityNotFoundException ignored){}
    }
    @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
    @Override protected void onPause(){super.onPause();denyMicrophone();web.onPause();web.evaluateJavascript("document.querySelectorAll('audio,video').forEach(function(a){a.pause()});window.dispatchEvent(new Event('jpn-app-pause'));",null);CookieManager.getInstance().flush();}
    @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();}
    @Override protected void onDestroy(){denyMicrophone();if(web!=null){web.stopLoading();web.destroy();}super.onDestroy();}
}
